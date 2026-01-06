// lib/sms/flows/sell.js
// Sell flow with minimal AI - uses listings table

import { msg } from '../messages.js';
import { setState, updateConversation, findDraftListing, createListing, updateListing, deleteListing, getListing, addPhotoToListing, getListingMissingFields, getListingMissingPhotos, isListingComplete } from '../db.js';
import { extractListingData, validatePhotosAreSameOutfit } from '../ai.js';
import { createDraft, addProductImage } from '../../shopify.js';

/**
 * Handle all sell flow states
 */
export async function handleSellFlow(message, conversation, seller, mediaUrls = []) {
  const state = conversation.state;
  const context = conversation.context || {};
  const listingId = context.listing_id;
  const lower = message.toLowerCase().trim();

  // Detect interruption - someone trying to restart while mid-listing
  const restartKeywords = ['sell', 'voice', 'text', 'form', '1', '2', '3'];
  const isRestartAttempt = restartKeywords.includes(lower) && state !== 'sell_started' && state !== 'sell_interruption';

  if (isRestartAttempt && listingId) {
    const listing = await getListing(listingId);
    await setState(conversation.id, 'sell_interruption', { listing_id: listingId, attempted_action: lower });
    return msg('SELL_IN_PROGRESS', listing?.designer, listing?.item_type);
  }

  // Handle interruption response
  if (state === 'sell_interruption') {
    if (['continue', 'continue_listing', 'c', '1'].includes(lower)) {
      // Resume where they left off
      const listing = listingId ? await getListing(listingId) : null;
      if (listing) {
        const missingFields = getListingMissingFields(listing);
        const missingPhotos = getListingMissingPhotos(listing);

        if (missingFields.length === 0 && missingPhotos.length === 0) {
          await setState(conversation.id, 'sell_confirming', { listing_id: listingId });
          return msg('SELL_SUMMARY', listing) + '\n\n' + msg('SELL_CONFIRM').text;
        }

        // Go back to collecting
        if (!listing.photo_tag_url) {
          await setState(conversation.id, 'sell_awaiting_tag_photo', { listing_id: listingId });
          return msg('SELL_ASK_TAG_PHOTO');
        }
        if ((listing.photo_urls?.length || 0) < 3) {
          await setState(conversation.id, 'sell_awaiting_item_photos', { listing_id: listingId });
          return msg('SELL_ASK_ITEM_PHOTOS', 3 - (listing.photo_urls?.length || 0));
        }

        await setState(conversation.id, 'sell_awaiting_text', { listing_id: listingId });
        return getNextPrompt(listing, missingFields, missingPhotos);
      }
    }

    if (['new', 'start_fresh', 'fresh', 'n', '2'].includes(lower)) {
      // Delete old listing and start fresh
      if (listingId) await deleteListing(listingId);
      await setState(conversation.id, 'sell_started', {});
      return msg('SELL_START');
    }

    // Didn't understand - ask again
    const listing = listingId ? await getListing(listingId) : null;
    return msg('SELL_IN_PROGRESS', listing?.designer, listing?.item_type);
  }

  // SELL_STARTED - show input method options
  if (state === 'sell_started') {
    // Safety check - need seller to create listings
    if (!seller?.id) {
      await setState(conversation.id, 'awaiting_email', { pending_intent: 'sell' });
      return msg('ASK_EMAIL_VERIFY');
    }

    // Check for input method selection
    if (['voice', '1'].includes(lower)) {
      await setState(conversation.id, 'sell_awaiting_voice', { ...context, input_method: 'voice' });
      return msg('SELL_VOICE_PROMPT');
    }
    if (['text', '2'].includes(lower)) {
      await setState(conversation.id, 'sell_awaiting_text', { ...context, input_method: 'text' });
      return msg('SELL_TEXT_PROMPT');
    }
    if (['form', '3'].includes(lower)) {
      // Start form flow - create listing and ask first question
      const listing = await createListing(seller.id, conversation.id, 'form');
      await setState(conversation.id, 'sell_form_designer', { listing_id: listing.id });
      return msg('SELL_ASK_DESIGNER');
    }

    // If they sent photos without selecting method, assume text
    if (mediaUrls.length > 0) {
      const listing = await createListing(seller.id, conversation.id, 'text');
      await handlePhotos(listing.id, mediaUrls, listing);
      await setState(conversation.id, 'sell_awaiting_text', { listing_id: listing.id });
      return msg('SELL_TEXT_PROMPT');
    }

    return msg('SELL_START');
  }

  // SELL_AWAITING_VOICE or SELL_AWAITING_TEXT - process free-form input
  if (state === 'sell_awaiting_voice' || state === 'sell_awaiting_text') {
    // Get or create listing
    let listing;
    if (listingId) {
      listing = await getListing(listingId);
    }
    if (!listing) {
      listing = await createListing(seller.id, conversation.id, context.input_method || 'text');
    }

    // Handle photos
    if (mediaUrls.length > 0) {
      await handlePhotos(listing.id, mediaUrls, listing);
      listing = await getListing(listing.id);
    }

    // Extract data from message using AI
    let extractedSomething = false;
    if (message) {
      const extracted = await extractListingData(message, listing);
      if (extracted && Object.keys(extracted).length > 0) {
        listing = await updateListing(listing.id, extracted);
        extractedSomething = true;
      }
    }

    // Check what's missing
    const missingFields = getListingMissingFields(listing);
    const missingPhotos = getListingMissingPhotos(listing);

    // If complete, show summary
    if (missingFields.length === 0 && missingPhotos.length === 0) {
      await setState(conversation.id, 'sell_confirming', { listing_id: listing.id });
      return msg('SELL_SUMMARY', listing) + '\n\n' + msg('SELL_CONFIRM').text;
    }

    // If message was sent but nothing extracted, ask to clarify
    if (message && !extractedSomething && mediaUrls.length === 0) {
      await setState(conversation.id, state, { listing_id: listing.id });
      return msg('SELL_DIDNT_UNDERSTAND');
    }

    // Ask for what's missing
    await setState(conversation.id, state, { listing_id: listing.id });
    return getNextPrompt(listing, missingFields, missingPhotos);
  }

  // FORM FLOW - step by step questions
  // Accept photos anytime during form flow
  if (state.startsWith('sell_form_') && mediaUrls.length > 0 && listingId) {
    let listing = await getListing(listingId);
    await handlePhotos(listingId, mediaUrls, listing);
    // Continue processing the text answer below
  }

  if (state === 'sell_form_designer') {
    let listing = listingId ? await getListing(listingId) : await createListing(seller.id, conversation.id, 'form');
    await updateListing(listing.id, { designer: message });
    await setState(conversation.id, 'sell_form_item_type', { listing_id: listing.id });
    return msg('SELL_ASK_ITEM_TYPE');
  }

  if (state === 'sell_form_item_type') {
    const itemTypeMap = {
      'kurta': 'Kurta',
      '3piece': '3-Piece Suit',
      'lehnga': 'Lehnga',
      'saree': 'Saree',
      '2piece': '2-Piece Suit'
    };
    const itemType = itemTypeMap[lower] || message;
    await updateListing(listingId, { item_type: itemType });
    await setState(conversation.id, 'sell_form_size', { listing_id: listingId });
    return msg('SELL_ASK_SIZE');
  }

  if (state === 'sell_form_size') {
    const sizeMap = {
      'xs': 'XS',
      'small': 'S',
      's': 'S',
      'medium': 'M',
      'm': 'M',
      'large': 'L',
      'l': 'L',
      'xl': 'XL',
      'xxl': 'XXL'
    };
    const size = sizeMap[lower] || message;
    await updateListing(listingId, { size });
    await setState(conversation.id, 'sell_form_condition', { listing_id: listingId });
    return msg('SELL_ASK_CONDITION');
  }

  if (state === 'sell_form_condition') {
    const conditionMap = {
      'nwt': 'New with tags',
      'like_new': 'Like new',
      'good': 'Gently used',
      'new with tags': 'New with tags',
      'like new': 'Like new',
      'gently used': 'Gently used'
    };
    const condition = conditionMap[lower] || message;
    await updateListing(listingId, { condition });
    await setState(conversation.id, 'sell_form_price', { listing_id: listingId });
    return msg('SELL_ASK_PRICE');
  }

  if (state === 'sell_form_price') {
    const price = parsePrice(message);
    if (!price) {
      return msg('SELL_INVALID_PRICE');
    }
    await updateListing(listingId, { asking_price_usd: price });
    await setState(conversation.id, 'sell_awaiting_tag_photo', { listing_id: listingId });
    return msg('SELL_GOT_IT') + '\n\n' + msg('SELL_ASK_TAG_PHOTO');
  }

  // PHOTO COLLECTION
  if (state === 'sell_awaiting_tag_photo') {
    if (mediaUrls.length === 0) {
      return msg('SELL_ASK_TAG_PHOTO');
    }
    await addPhotoToListing(listingId, mediaUrls[0], true);

    // If more photos were sent, add them as item photos
    for (let i = 1; i < mediaUrls.length; i++) {
      await addPhotoToListing(listingId, mediaUrls[i], false);
    }

    const listing = await getListing(listingId);
    const itemPhotosNeeded = 3 - (listing.photo_urls?.length || 0);

    if (itemPhotosNeeded > 0) {
      await setState(conversation.id, 'sell_awaiting_item_photos', { listing_id: listingId });
      return msg('SELL_ASK_ITEM_PHOTOS', itemPhotosNeeded);
    }

    // All photos collected, show summary
    await setState(conversation.id, 'sell_confirming', { listing_id: listingId });
    return msg('SELL_SUMMARY', listing) + '\n\n' + msg('SELL_CONFIRM').text;
  }

  if (state === 'sell_awaiting_item_photos') {
    let listing = await getListing(listingId);
    const currentCount = listing.photo_urls?.length || 0;

    if (mediaUrls.length === 0) {
      // No photos sent - check if we have minimum
      if (currentCount >= 3) {
        await setState(conversation.id, 'sell_confirming', { listing_id: listingId });
        return msg('SELL_SUMMARY', listing) + '\n\n' + msg('SELL_CONFIRM').text;
      }
      const needed = 3 - currentCount;
      return msg('SELL_ASK_ITEM_PHOTOS', needed);
    }

    // Add ALL photos (no limit - users can send as many as they want)
    for (const url of mediaUrls) {
      await addPhotoToListing(listingId, url, false);
    }

    listing = await getListing(listingId);
    const allPhotos = [listing.photo_tag_url, ...(listing.photo_urls || [])].filter(Boolean);

    // Validate all photos are of the same outfit
    const validation = await validatePhotosAreSameOutfit(allPhotos);
    if (!validation.valid) {
      // Clear photos and ask to resend
      await updateListing(listingId, { photo_tag_url: null, photo_urls: [] });
      await setState(conversation.id, 'sell_awaiting_tag_photo', { listing_id: listingId });
      return msg('SELL_PHOTOS_MISMATCH', validation.reason);
    }

    const itemPhotosNeeded = Math.max(0, 3 - (listing.photo_urls?.length || 0));

    if (itemPhotosNeeded > 0) {
      return msg('SELL_ASK_ITEM_PHOTOS', itemPhotosNeeded);
    }

    // Have minimum photos - show summary
    await setState(conversation.id, 'sell_confirming', { listing_id: listingId });
    return msg('SELL_SUMMARY', listing) + '\n\n' + msg('SELL_CONFIRM').text;
  }

  // CONFIRMATION
  if (state === 'sell_confirming') {
    const listing = await getListing(listingId);

    if (['yes', 'y', 'submit', '1'].includes(lower)) {
      return await submitListing(listing, conversation, seller);
    }

    if (['edit', '2'].includes(lower)) {
      await setState(conversation.id, 'sell_editing', { listing_id: listingId });
      return msg('SELL_WHAT_TO_EDIT');
    }

    if (['cancel', 'no', 'n', '3'].includes(lower)) {
      await deleteListing(listingId);
      await setState(conversation.id, 'authorized', {});
      return msg('SELL_DRAFT_DELETED') + '\n\n' + msg('MENU').text;
    }

    return msg('SELL_SUMMARY', listing) + '\n\n' + msg('SELL_CONFIRM').text;
  }

  // EDITING
  if (state === 'sell_editing') {
    if (['edit_details', 'details', '1'].includes(lower)) {
      await setState(conversation.id, 'sell_form_designer', { listing_id: listingId });
      return msg('SELL_ASK_DESIGNER');
    }
    if (['edit_photos', 'photos', '2'].includes(lower)) {
      await updateListing(listingId, { photo_tag_url: null, photo_urls: [] });
      await setState(conversation.id, 'sell_awaiting_tag_photo', { listing_id: listingId });
      return msg('SELL_ASK_TAG_PHOTO');
    }
    if (['edit_price', 'price', '3'].includes(lower)) {
      await setState(conversation.id, 'sell_form_price', { listing_id: listingId });
      return msg('SELL_ASK_PRICE');
    }
    return msg('SELL_WHAT_TO_EDIT');
  }

  return msg('SELL_START');
}

/**
 * Handle photos - determine if tag or item photo
 */
async function handlePhotos(listingId, mediaUrls, listing) {
  for (const url of mediaUrls) {
    if (!listing.photo_tag_url) {
      await addPhotoToListing(listingId, url, true);
      listing = await getListing(listingId);
    } else {
      await addPhotoToListing(listingId, url, false);
    }
  }
}

/**
 * Get next prompt based on what's missing
 */
function getNextPrompt(listing, missingFields, missingPhotos) {
  // Ask for fields first
  if (missingFields.length > 0) {
    const field = missingFields[0];
    const prompts = {
      designer: 'SELL_ASK_DESIGNER',
      item_type: 'SELL_ASK_ITEM_TYPE',
      size: 'SELL_ASK_SIZE',
      condition: 'SELL_ASK_CONDITION',
      asking_price_usd: 'SELL_ASK_PRICE'
    };
    return msg(prompts[field] || 'SELL_TEXT_PROMPT');
  }

  // Then photos
  if (missingPhotos.includes('tag')) {
    return msg('SELL_ASK_TAG_PHOTO');
  }

  const itemPhotosMatch = missingPhotos.find(p => p.includes('photo'));
  if (itemPhotosMatch) {
    const count = parseInt(itemPhotosMatch) || 3;
    return msg('SELL_ASK_ITEM_PHOTOS', count);
  }

  return msg('SELL_TEXT_PROMPT');
}

/**
 * Parse price from user input
 */
function parsePrice(text) {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

/**
 * Submit listing to Shopify
 */
async function submitListing(listing, conversation, seller) {
  try {
    // Create Shopify draft with seller info
    const shopifyProduct = await createDraft({
      designer: listing.designer,
      itemType: listing.item_type,
      size: listing.size,
      condition: listing.condition,
      askingPrice: listing.asking_price_usd,
      pieces: listing.pieces_included,
      sellerEmail: seller?.email,
      sellerId: seller?.id
    });

    // Upload tag photo first
    if (listing.photo_tag_url) {
      await uploadPhotoToShopify(shopifyProduct.id, listing.photo_tag_url);
    }

    // Upload item photos
    if (listing.photo_urls?.length > 0) {
      for (const photoUrl of listing.photo_urls) {
        await uploadPhotoToShopify(shopifyProduct.id, photoUrl);
      }
    }

    // Update listing with Shopify info
    await updateListing(listing.id, {
      status: 'pending_approval',
      shopify_product_id: shopifyProduct.id,
      shopify_product_url: shopifyProduct.admin_graphql_api_id
    });

    // Clear conversation state
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
    const imgResponse = await fetch(photoUrl);
    const buffer = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    await addProductImage(productId, base64, 'listing.jpg');
  } catch (error) {
    console.error('Failed to upload image to Shopify:', error);
  }
}
