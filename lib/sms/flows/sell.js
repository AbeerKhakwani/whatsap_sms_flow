// lib/sms/flows/sell.js
// Unified sell flow - no menu choices, just natural conversation

import { msg, calculatePayout } from '../messages.js';
import { setState, createListing, updateListing, deleteListing, getListing, addPhotoToListing, getListingMissingFields, getListingMissingPhotos } from '../db.js';
import { extractListingData, analyzePhoto } from '../ai.js';
import { createDraft, addProductImage } from '../../shopify.js';

const REQUIRED_FIELDS = ['designer', 'item_type', 'size', 'condition', 'asking_price_usd'];
const FIELD_LABELS = {
  designer: 'designer/brand',
  item_type: 'item type',
  size: 'size',
  condition: 'condition',
  asking_price_usd: 'price'
};

/**
 * Handle all sell flow states
 */
export async function handleSellFlow(message, conversation, seller, mediaUrls = []) {
  const state = conversation.state;
  const context = conversation.context || {};
  const listingId = context.listing_id;
  const lower = message.toLowerCase().trim();

  // ===== SELL_STARTED - First message after "SELL" =====
  if (state === 'sell_started') {
    if (!seller?.id) {
      await setState(conversation.id, 'awaiting_email', { pending_intent: 'sell' });
      return msg('ASK_EMAIL_VERIFY');
    }

    // Check for existing draft
    const existingListing = listingId ? await getListing(listingId) : null;
    if (existingListing && existingListing.status === 'draft') {
      await setState(conversation.id, 'sell_draft_choice', { listing_id: listingId });
      return msg('SELL_DRAFT_FOUND', existingListing.designer, existingListing.item_type);
    }

    // Create new listing
    const listing = await createListing(seller.id, conversation.id, 'unified');
    await setState(conversation.id, 'sell_collecting', { listing_id: listing.id });

    // If user provided content with their sell request, process it immediately
    if ((message && message.length > 0) || mediaUrls.length > 0) {
      // Update conversation object with new state/context for sell_collecting handler
      conversation.state = 'sell_collecting';
      conversation.context = { listing_id: listing.id };
      // Fall through to sell_collecting handler below
    } else {
      return msg('SELL_START');
    }
  }

  // ===== SELL_DRAFT_CHOICE - Continue or start fresh =====
  if (state === 'sell_draft_choice') {
    if (['1', 'continue', 'yes', 'y'].includes(lower)) {
      const listing = await getListing(listingId);
      await setState(conversation.id, 'sell_collecting', { listing_id: listingId });
      return continueFromWhereWeAre(listing, conversation);
    }
    if (['2', 'fresh', 'new', 'start'].includes(lower)) {
      if (listingId) await deleteListing(listingId);
      const listing = await createListing(seller.id, conversation.id, 'unified');
      await setState(conversation.id, 'sell_collecting', { listing_id: listing.id });
      return msg('SELL_DRAFT_DELETED') + '\n\n' + msg('SELL_START');
    }
    return msg('SELL_DRAFT_FOUND', context.designer, context.item_type);
  }

  // ===== SELL_COLLECTING - Main collection state =====
  // Also handle legacy states from old code
  const collectingStates = ['sell_collecting', 'sell_awaiting_text', 'sell_awaiting_voice', 'sell_awaiting_photos'];
  if (collectingStates.includes(state) || collectingStates.includes(conversation.state)) {
    // Re-read listingId in case we fell through from sell_started
    const currentListingId = conversation.context?.listing_id || listingId;
    let listing = currentListingId ? await getListing(currentListingId) : await createListing(seller.id, conversation.id, 'unified');
    if (!currentListingId) {
      await setState(conversation.id, 'sell_collecting', { listing_id: listing.id });
    }

    // Check for status questions first
    const statusPhrases = ['status', 'what did i', 'what do i have', 'show me', 'what have i', 'so far', 'summary', 'where am i'];
    const isStatusQuestion = statusPhrases.some(phrase => lower.includes(phrase));

    if (isStatusQuestion) {
      const missingFields = getMissingFields(listing);
      const photoCount = (listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0);
      const payout = calculatePayout(listing.asking_price_usd);
      const missingLabels = missingFields.map(f => FIELD_LABELS[f]);

      if (missingFields.length === 0 && photoCount >= 3) {
        return msg('SELL_SUMMARY', listing, payout);
      }
      return msg('SELL_EXTRACTED', listing, payout, missingLabels);
    }

    // Handle photos
    if (mediaUrls.length > 0) {
      const photoResult = await handlePhotosWithValidation(listing.id, mediaUrls, listing);
      listing = await getListing(listing.id);

      // If photo wasn't clothing, tell them
      if (photoResult.notClothing) {
        return msg('SELL_PHOTO_NOT_CLOTHING');
      }
    }

    // Extract data from text/voice
    let extractedSomething = false;
    let rejectedBrand = null;
    if (message && message.length > 0) {
      const extracted = await extractListingData(message, listing);

      // Check for rejected brand (custom/Indian)
      if (extracted.rejected_brand) {
        rejectedBrand = extracted.rejected_brand;
        delete extracted.rejected_brand;
      }

      if (extracted && Object.keys(extracted).length > 0) {
        listing = await updateListing(listing.id, extracted);
        extractedSomething = true;
      }
    }

    // If brand was rejected, tell them why
    if (rejectedBrand === 'custom_made') {
      return msg('SELL_NO_CUSTOM');
    }
    if (rejectedBrand === 'indian_brand') {
      return msg('SELL_NO_INDIAN');
    }

    // Check what's missing
    const missingFields = getMissingFields(listing);
    const photoCount = (listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0);
    const payout = calculatePayout(listing.asking_price_usd);

    // All fields filled?
    if (missingFields.length === 0) {
      // Ask for details/flaws ONLY if we don't have details yet AND haven't asked
      if (!listing.details && !context.asked_details) {
        await setState(conversation.id, 'sell_details', { listing_id: listing.id });
        // Just acknowledge + ask for flaws (don't show full summary yet - that comes with photos)
        return `Got it! ${listing.designer} ${listing.item_type}, size ${listing.size}, ${listing.condition}, $${listing.asking_price_usd}. 💰\n\n` + msg('SELL_ASK_DETAILS');
      }

      // If we already have details, skip straight to photos (no need to ask about flaws again)

      // Need photos?
      if (photoCount < 3) {
        await setState(conversation.id, 'sell_photos', { listing_id: listing.id });
        return msg('SELL_READY_FOR_PHOTOS', listing, payout);
      }

      // Ready for confirmation!
      await setState(conversation.id, 'sell_confirming', { listing_id: listing.id });
      return msg('SELL_SUMMARY', listing, payout);
    }

    // Still collecting - show what we have and ask for more
    const missingLabels = missingFields.map(f => FIELD_LABELS[f]);

    // If nothing was extracted from this message and no photos, prompt differently
    if (message && !mediaUrls.length && !extractedSomething) {
      return msg('SELL_DIDNT_UNDERSTAND');
    }

    return msg('SELL_EXTRACTED', listing, payout, missingLabels);
  }

  // ===== SELL_DETAILS - Optional details question =====
  if (state === 'sell_details') {
    let listing = await getListing(listingId);

    // Handle photos sent with details
    if (mediaUrls.length > 0) {
      await handlePhotosWithValidation(listingId, mediaUrls, listing);
      listing = await getListing(listingId);
    }

    // Save details (unless skip)
    const skipPhrases = ['skip', 'none', 'no', 'n/a', 'na', 'nothing', 'nope'];
    if (message && !skipPhrases.includes(lower)) {
      await updateListing(listingId, { details: message });
      listing = await getListing(listingId);
    }

    const photoCount = (listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0);
    const payout = calculatePayout(listing.asking_price_usd);

    // Need photos?
    if (photoCount < 3) {
      await setState(conversation.id, 'sell_photos', { listing_id: listingId, asked_details: true });
      return msg('SELL_READY_FOR_PHOTOS', listing, payout);
    }

    // Ready!
    await setState(conversation.id, 'sell_confirming', { listing_id: listingId });
    return msg('SELL_SUMMARY', listing, payout);
  }

  // ===== SELL_PHOTOS - Collecting photos =====
  if (state === 'sell_photos') {
    let listing = await getListing(listingId);

    if (mediaUrls.length === 0) {
      const photoCount = (listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0);
      const payout = calculatePayout(listing.asking_price_usd);

      if (photoCount >= 3) {
        // Move to description step
        await setState(conversation.id, 'sell_description', { listing_id: listingId });
        return msg('SELL_ASK_DESCRIPTION', listing);
      }
      return msg('SELL_READY_FOR_PHOTOS', listing, payout);
    }

    // Analyze and add photos
    const photoResult = await handlePhotosWithValidation(listingId, mediaUrls, listing);
    listing = await getListing(listingId);

    if (photoResult.notClothing) {
      return msg('SELL_PHOTO_NOT_CLOTHING');
    }

    // Update listing with any details extracted from photos
    if (photoResult.extractedDetails) {
      const currentDetails = listing.details || '';
      const newDetails = currentDetails
        ? `${currentDetails}, ${photoResult.extractedDetails}`
        : photoResult.extractedDetails;
      await updateListing(listingId, { details: newDetails });
      listing = await getListing(listingId);
    }

    const photoCount = (listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0);
    const payout = calculatePayout(listing.asking_price_usd);

    // Enough photos?
    if (photoCount >= 3) {
      // Move to description step
      await setState(conversation.id, 'sell_description', { listing_id: listingId });
      return msg('SELL_ASK_DESCRIPTION', listing);
    }

    // Need more
    return msg('SELL_PHOTO_RECEIVED', photoCount, photoResult.feedback);
  }

  // ===== SELL_DESCRIPTION - Ask for additional description =====
  if (state === 'sell_description') {
    let listing = await getListing(listingId);

    // Handle more photos if they send them
    if (mediaUrls.length > 0) {
      await handlePhotosWithValidation(listingId, mediaUrls, listing);
      listing = await getListing(listingId);
    }

    const skipPhrases = ['skip', 'none', 'no', 'n/a', 'na', 'nothing', 'nope', 'no flaws', 'perfect', 'good'];
    if (message && !skipPhrases.includes(lower)) {
      // Add to existing details
      const currentDetails = listing.details || '';
      const newDetails = currentDetails ? `${currentDetails}. ${message}` : message;
      await updateListing(listingId, { details: newDetails });
    }

    // Move to link step
    await setState(conversation.id, 'sell_link', { listing_id: listingId });
    return msg('SELL_ASK_LINK');
  }

  // ===== SELL_LINK - Ask for original listing link (optional) =====
  if (state === 'sell_link') {
    let listing = await getListing(listingId);

    const skipPhrases = ['skip', 'none', 'no', 'n/a', 'na', 'nothing', 'nope', 'dont have', "don't have", 'no link'];
    if (message && !skipPhrases.includes(lower)) {
      // Check if it looks like a URL
      if (message.includes('http') || message.includes('.com') || message.includes('.pk')) {
        await updateListing(listingId, { original_link: message.trim() });
      }
    }

    listing = await getListing(listingId);
    const payout = calculatePayout(listing.asking_price_usd);

    // Move to confirmation
    await setState(conversation.id, 'sell_confirming', { listing_id: listingId });
    return msg('SELL_SUMMARY', listing, payout);
  }

  // ===== SELL_CONFIRMING - Final confirmation =====
  if (state === 'sell_confirming') {
    const listing = await getListing(listingId);
    const payout = calculatePayout(listing.asking_price_usd);

    if (['1', 'yes', 'submit', 'y'].includes(lower)) {
      return await submitListing(listing, conversation, seller);
    }

    if (['2', 'edit'].includes(lower)) {
      await setState(conversation.id, 'sell_editing', { listing_id: listingId });
      return msg('SELL_WHAT_TO_EDIT');
    }

    if (['3', 'cancel', 'no', 'n'].includes(lower)) {
      await deleteListing(listingId);
      await setState(conversation.id, 'authorized', {});
      return msg('SELL_DRAFT_DELETED') + '\n\n' + msg('MENU');
    }

    return msg('SELL_SUMMARY', listing, payout);
  }

  // ===== SELL_EDITING - Edit something =====
  if (state === 'sell_editing') {
    if (['1', 'details'].includes(lower)) {
      // Clear fields and restart collection
      await updateListing(listingId, {
        designer: null, item_type: null, size: null, condition: null, asking_price_usd: null, details: null
      });
      await setState(conversation.id, 'sell_collecting', { listing_id: listingId });
      return msg('SELL_START');
    }
    if (['2', 'photos'].includes(lower)) {
      await updateListing(listingId, { photo_tag_url: null, photo_urls: [] });
      const listing = await getListing(listingId);
      const payout = calculatePayout(listing.asking_price_usd);
      await setState(conversation.id, 'sell_photos', { listing_id: listingId });
      return msg('SELL_READY_FOR_PHOTOS', listing, payout);
    }
    if (['3', 'price'].includes(lower)) {
      await updateListing(listingId, { asking_price_usd: null });
      await setState(conversation.id, 'sell_collecting', { listing_id: listingId });
      return `What's your new asking price in USD?`;
    }
    if (['4', 'back'].includes(lower)) {
      const listing = await getListing(listingId);
      const payout = calculatePayout(listing.asking_price_usd);
      await setState(conversation.id, 'sell_confirming', { listing_id: listingId });
      return msg('SELL_SUMMARY', listing, payout);
    }
    return msg('SELL_WHAT_TO_EDIT');
  }

  // Default: restart sell flow
  return msg('SELL_START');
}

/**
 * Get missing required fields
 */
function getMissingFields(listing) {
  return REQUIRED_FIELDS.filter(field => !listing[field]);
}

/**
 * Handle photos with AI validation
 */
async function handlePhotosWithValidation(listingId, mediaUrls, listing) {
  let feedback = null;
  let notClothing = false;
  let hasTag = listing.photo_tag_url ? true : false;
  let extractedDetails = null;

  for (const url of mediaUrls) {
    // Analyze photo
    const analysis = await analyzePhoto(url);

    if (!analysis.isClothing) {
      notClothing = true;
      return { notClothing: true, feedback: analysis.issue, extractedDetails: null };
    }

    // Get feedback from first photo
    if (!feedback && analysis.description) {
      feedback = analysis.description + ' ✨';
    }

    // Collect extracted details from all photos
    if (analysis.extractedDetails) {
      if (!extractedDetails) {
        extractedDetails = analysis.extractedDetails;
      } else {
        // Append new details if they add information
        extractedDetails = `${extractedDetails}; ${analysis.extractedDetails}`;
      }
    }

    // Check for brand tag
    if (analysis.hasBrandTag && !hasTag) {
      await addPhotoToListing(listingId, url, true); // Add as tag photo
      hasTag = true;

      // If brand visible, update listing
      if (analysis.brandName) {
        await updateListing(listingId, { designer: analysis.brandName });
      }
      continue;
    }

    // Add as regular photo
    await addPhotoToListing(listingId, url, false);
  }

  return { notClothing: false, feedback, hasTag, extractedDetails };
}

/**
 * Continue from where we left off - show current draft status
 */
async function continueFromWhereWeAre(listing, conversation) {
  const missingFields = getMissingFields(listing);
  const missingLabels = missingFields.map(f => FIELD_LABELS[f]);
  const photoCount = (listing.photo_urls?.length || 0) + (listing.photo_tag_url ? 1 : 0);
  const payout = calculatePayout(listing.asking_price_usd);

  // If ready for confirmation, go to that state
  if (missingFields.length === 0 && photoCount >= 3) {
    await setState(conversation.id, 'sell_confirming', { listing_id: listing.id });
    return msg('SELL_SUMMARY', listing, payout);
  }

  // If only photos needed, go to photos state
  if (missingFields.length === 0 && photoCount < 3) {
    await setState(conversation.id, 'sell_photos', { listing_id: listing.id });
  }

  // Show what they have and what's missing
  return msg('SELL_RESUME', listing, payout, missingLabels);
}

/**
 * Submit listing to Shopify
 */
async function submitListing(listing, conversation, seller) {
  try {
    const shopifyProduct = await createDraft({
      designer: listing.designer,
      itemType: listing.item_type,
      size: listing.size,
      condition: listing.condition,
      askingPrice: listing.asking_price_usd,
      description: listing.details,
      sellerEmail: seller?.email,
      sellerId: seller?.id
    });

    // Upload photos
    const allPhotos = [];
    if (listing.photo_tag_url) allPhotos.push(listing.photo_tag_url);
    if (listing.photo_urls?.length) {
      for (const url of listing.photo_urls) {
        if (!allPhotos.includes(url)) allPhotos.push(url);
      }
    }

    for (const photoUrl of allPhotos) {
      await uploadPhotoToShopify(shopifyProduct.id, photoUrl);
    }

    // Update listing
    await updateListing(listing.id, {
      status: 'pending_approval',
      shopify_product_id: shopifyProduct.id
    });

    await setState(conversation.id, 'authorized', {});
    return msg('SELL_COMPLETE');
  } catch (error) {
    console.error('Failed to submit listing:', error);
    return "Oops, something went wrong. Please try again or text MENU.";
  }
}

/**
 * Upload photo to Shopify
 */
async function uploadPhotoToShopify(productId, photoUrl) {
  try {
    const response = await fetch(photoUrl);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    await addProductImage(productId, base64, 'listing.jpg');
  } catch (error) {
    console.error('Failed to upload image:', error);
  }
}
