/**
 * SMS Webhook - Clean Router
 */

import { msg } from '../lib/sms/messages.js';
import { normalizePhone, sendResponse, getGlobalCommand, logState } from '../lib/sms/helpers.js';
import { findSellerByPhone, findConversation, createConversation, updateConversation, setState, getIncompleteListing, deleteListing } from '../lib/sms/db.js';
import { detectIntent } from '../lib/sms/intent.js';
import { handleAwaitingAccountCheck, handleAwaitingExistingEmail, handleAwaitingNewEmail, handleAwaitingEmail } from '../lib/sms/flows/auth.js';
import { handleSellFlow } from '../lib/sms/flows/sell.js';
import { processMediaUrls } from '../lib/sms/media.js';


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { From, Body = '', NumMedia, MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3, MediaUrl4, MessageSid } = req.body;

    // Collect media URLs
    const mediaUrls = [MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3, MediaUrl4].filter(Boolean);

    const phone = normalizePhone(From);
    const message = Body.trim();

    // Load data
    const seller = await findSellerByPhone(phone);
    let conv = await findConversation(phone);
    if (!conv) conv = await createConversation(phone, seller?.id);

    logState(phone, seller, conv);

    // Process media URLs (download from Twilio, upload to Supabase)
    let supabaseUrls = [];
    if (mediaUrls.length > 0 && seller) {
      console.log('📸 Processing media URLs...');
      supabaseUrls = await processMediaUrls(mediaUrls, seller.id, MessageSid);
      console.log('✅ Media processed:', supabaseUrls.length, 'URLs');
    }

    // Route message
    const response = await route(message, conv, seller, phone, supabaseUrls);
    return sendResponse(res, response);

  } catch (error) {
    console.error('❌ Error:', error);
    return sendResponse(res, msg('ERROR'));
  }
}

async function route(message, conv, seller, phone, supabaseUrls = []) {
  const state = conv.state || 'new';

  // 1. Global commands
  const cmd = getGlobalCommand(message);
  if (cmd === 'HELP') return msg('HELP');
  if (cmd === 'STOP') {
    await setState(conv.id, 'unsubscribed');
    return msg('STOP');
  }
  if (cmd === 'START' || cmd === 'MENU') {
    if (conv.is_authorized) {
      await setState(conv.id, 'authorized');
      return msg('MENU');
    }
    if (seller) {
      await setState(conv.id, 'awaiting_action');
      return msg('WELCOME_KNOWN_SELLER');
    }
    await setState(conv.id, 'awaiting_account_check');
    return msg('WELCOME_NEW_USER');
  }

  // 2. If media URLs are present AND not already in sell flow, treat as sell intent
  if (supabaseUrls.length > 0 && seller && !state.startsWith('sell_')) {
    if (!conv.is_authorized) {
      await setState(conv.id, 'awaiting_email', { pending_intent: 'sell', media_urls: supabaseUrls });
      return msg('ASK_EMAIL_VERIFY');
    }

    // Check for existing draft first
    const draft = await getIncompleteListing(seller.id);
    if (draft) {
      const designer = draft.listing_data?.designer || '';
      const itemType = draft.listing_data?.item_type || '';
      // Store the new photos in context so we don't lose them
      await setState(conv.id, 'sell_draft_check', {
        listing_id: draft.id,
        pending_media_urls: supabaseUrls
      });
      return msg('SELL_DRAFT_FOUND', designer, itemType);
    }

    await setState(conv.id, 'sell_started', { media_urls: supabaseUrls });
    return msg('SELL_START');
  }

  // 3. Blocked if unsubscribed
  if (state === 'unsubscribed') return msg('UNSUBSCRIBED_BLOCK');

  // 4. Route by state
  if (state === 'awaiting_account_check') return handleAwaitingAccountCheck(message, conv, phone);
  if (state === 'awaiting_existing_email') return handleAwaitingExistingEmail(message, conv, phone);
  if (state === 'awaiting_new_email') return handleAwaitingNewEmail(message, conv, phone);
  if (state === 'awaiting_email') return handleAwaitingEmail(message, conv, seller);

  // 5. Handle draft check response (CONTINUE or NEW)
  if (state === 'sell_draft_check') {
    const lower = message.toLowerCase().trim();
    const listingId = conv.context?.listing_id;
    const pendingPhotos = conv.context?.pending_media_urls || [];

    if (lower === 'continue' || lower === 'c' || lower === '1') {
      // Resume the draft
      const listing = await getIncompleteListing(seller.id);
      if (listing) {
        // Merge any pending photos from the new message
        const existingPhotos = listing.listing_data?.photos || [];
        const allPhotos = [...existingPhotos, ...pendingPhotos];

        await setState(conv.id, 'sell_collecting', {
          listing_id: listing.id,
          history: listing.conversation || [],
          media_urls: allPhotos
        });
        const designer = listing.listing_data?.designer || '';
        return `Let's continue! ${designer ? `You were listing a ${designer}.` : ''} What else can you tell me?`;
      }
    }

    if (lower === 'new' || lower === 'n' || lower === '2') {
      // Delete old draft, start fresh with pending photos
      if (listingId) await deleteListing(listingId);
      await setState(conv.id, 'sell_started', { media_urls: pendingPhotos });
      return msg('SELL_DRAFT_DELETED');
    }

    // Unclear response - ask again
    return msg('SELL_DRAFT_FOUND', '', '');
  }

  // 6. Handle sell flow states
  if (state.startsWith('sell_')) {
    const lower = message.toLowerCase().trim();

    // Handle exit commands - save draft and leave
    const exitCommands = [
      'exit', 'cancel', 'quit', 'stop', 'menu',     // formal
      'nvm', 'nevermind', 'never mind',              // changed mind
      'back', 'done', 'later',                       // stepping away
      'wait', 'hold on', 'one sec', 'brb',           // pausing
      'not now', 'not rn', 'gtg', 'busy'             // life happened
    ];
    
    if (exitCommands.includes(lower)) {
      await setState(conv.id, 'authorized', {});
      return msg('SELL_DRAFT_SAVED');
    }

    // Merge stored media URLs with any new ones
    const storedUrls = conv.context?.media_urls || [];
    const allUrls = [...storedUrls, ...supabaseUrls];
    return handleSellFlow(message, conv, seller, allUrls);
  }

  // 7. New user
  if (state === 'new') {
    if (seller) {
      await updateConversation(conv.id, { state: 'awaiting_action', seller_id: seller.id });
      return msg('WELCOME_KNOWN_SELLER');
    }
    await setState(conv.id, 'awaiting_account_check');
    return msg('WELCOME_NEW_USER');
  }

  // 8. Ready for action - detect intent
  if (state === 'awaiting_action' || state === 'authorized') {
    const intent = await detectIntent(message);
    
    if (intent === 'sell') {
      if (!conv.is_authorized && seller) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'sell' });
        return msg('ASK_EMAIL_VERIFY');
      }
      
      // Check for existing draft
      const draft = await getIncompleteListing(seller.id);
      if (draft) {
        const designer = draft.listing_data?.designer || '';
        const itemType = draft.listing_data?.item_type || '';
        await setState(conv.id, 'sell_draft_check', { listing_id: draft.id });
        return msg('SELL_DRAFT_FOUND', designer, itemType);
      }
      
      await setState(conv.id, 'sell_started', {});
      return msg('SELL_START');
    }
    
    if (intent === 'buy') {
      if (!conv.is_authorized && seller) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'buy' });
        return msg('ASK_EMAIL_VERIFY');
      }
      return msg('BUY_START');
    }
    
    if (intent === 'listings') {
      if (!conv.is_authorized && seller) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'listings' });
        return msg('ASK_EMAIL_VERIFY');
      }
      return msg('LISTINGS_START');
    }
    
    return msg('MENU');
  }

  return msg('MENU');
}