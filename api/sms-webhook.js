/**
 * SMS/WhatsApp Webhook - Clean Router
 * Handles Twilio SMS, Twilio WhatsApp, and WhatsApp Cloud API (Meta)
 */

import { msg } from '../lib/sms/messages.js';
import { normalizePhone, sendResponse, getGlobalCommand, logState } from '../lib/sms/helpers.js';
import { findSellerByPhone, findConversation, createConversation, updateConversation, setState, getIncompleteListing, deleteListing } from '../lib/sms/db.js';
import { detectIntent } from '../lib/sms/intent.js';
import { handleAwaitingAccountCheck, handleAwaitingExistingEmail, handleAwaitingNewEmail, handleAwaitingEmail } from '../lib/sms/flows/auth.js';
import { handleSellFlow } from '../lib/sms/flows/sell.js';
import { processMediaUrls, processWhatsAppMedia } from '../lib/sms/media.js';

// WhatsApp Cloud API config
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'phirstory_verify_token';

export default async function handler(req, res) {
  // WhatsApp Cloud API webhook verification (GET request)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Detect which platform the message is from
    const platform = detectPlatform(req.body);
    console.log('📨 Message from:', platform);

    let phone, message, mediaUrls, messageId;

    if (platform === 'whatsapp_cloud') {
      // Parse WhatsApp Cloud API format
      const parsed = parseWhatsAppCloudMessage(req.body);
      if (!parsed) {
        // Could be a status update, not a message - acknowledge it
        return res.status(200).json({ status: 'ok' });
      }
      ({ phone, message, mediaUrls, messageId } = parsed);
    } else {
      // Twilio format (SMS or WhatsApp via Twilio)
      const { From, Body = '', MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3, MediaUrl4, MessageSid } = req.body;
      const isWhatsApp = From?.startsWith('whatsapp:');
      const rawPhone = isWhatsApp ? From.replace('whatsapp:', '') : From;

      phone = normalizePhone(rawPhone);
      message = Body.trim();
      mediaUrls = [MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3, MediaUrl4].filter(Boolean);
      messageId = MessageSid;
    }

    // Load data
    const seller = await findSellerByPhone(phone);
    let conv = await findConversation(phone);
    if (!conv) conv = await createConversation(phone, seller?.id);

    // Store the platform for responses
    conv.platform = platform;

    logState(phone, seller, conv);

    // Process media
    let supabaseUrls = [];
    if (mediaUrls.length > 0 && seller) {
      console.log('📸 Processing media...');
      if (platform === 'whatsapp_cloud') {
        supabaseUrls = await processWhatsAppMedia(mediaUrls, seller.id, messageId);
      } else {
        supabaseUrls = await processMediaUrls(mediaUrls, seller.id, messageId);
      }
      console.log('✅ Media processed:', supabaseUrls.length, 'URLs');
    }

    // Route message
    const response = await route(message, conv, seller, phone, supabaseUrls);

    // Send response based on platform
    if (platform === 'whatsapp_cloud') {
      await sendWhatsAppResponse(phone, response);
      return res.status(200).json({ status: 'ok' });
    } else {
      return sendResponse(res, response);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    // For WhatsApp Cloud API, still return 200 to prevent retries
    if (req.body?.entry) {
      return res.status(200).json({ status: 'error', message: error.message });
    }
    return sendResponse(res, msg('ERROR'));
  }
}

/**
 * Detect which platform the message is from
 */
function detectPlatform(body) {
  if (body.entry && body.object === 'whatsapp_business_account') {
    return 'whatsapp_cloud';
  }
  if (body.From?.startsWith('whatsapp:')) {
    return 'twilio_whatsapp';
  }
  return 'twilio_sms';
}

/**
 * Parse WhatsApp Cloud API message format
 */
function parseWhatsAppCloudMessage(body) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return null; // Status update, not a message
    }

    const msg = messages[0];
    const phone = normalizePhone(msg.from);
    const messageId = msg.id;

    let message = '';
    let mediaUrls = [];

    // Handle different message types
    if (msg.type === 'text') {
      message = msg.text?.body || '';
    } else if (msg.type === 'image') {
      mediaUrls.push({ type: 'image', id: msg.image.id, mime: msg.image.mime_type });
      message = msg.image.caption || '';
    } else if (msg.type === 'video') {
      mediaUrls.push({ type: 'video', id: msg.video.id, mime: msg.video.mime_type });
      message = msg.video.caption || '';
    } else if (msg.type === 'document') {
      mediaUrls.push({ type: 'document', id: msg.document.id, mime: msg.document.mime_type });
      message = msg.document.caption || '';
    } else if (msg.type === 'interactive') {
      // Button replies
      if (msg.interactive.type === 'button_reply') {
        message = msg.interactive.button_reply.id;
      } else if (msg.interactive.type === 'list_reply') {
        message = msg.interactive.list_reply.id;
      }
    }

    return { phone, message: message.trim(), mediaUrls, messageId };
  } catch (error) {
    console.error('Error parsing WhatsApp message:', error);
    return null;
  }
}

/**
 * Send response via WhatsApp Cloud API
 */
async function sendWhatsAppResponse(phone, text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.error('❌ WhatsApp credentials not configured');
    return;
  }

  // Remove + from phone number for WhatsApp API
  const to = phone.replace('+', '');

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ WhatsApp API error:', error);
    } else {
      console.log('📤 WhatsApp response sent to:', phone);
    }
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
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
      const listing = await getIncompleteListing(seller.id);
      if (listing) {
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
      if (listingId) await deleteListing(listingId);
      await setState(conv.id, 'sell_started', { media_urls: pendingPhotos });
      return msg('SELL_DRAFT_DELETED');
    }

    return msg('SELL_DRAFT_FOUND', '', '');
  }

  // 6. Handle sell flow states
  if (state.startsWith('sell_')) {
    const lower = message.toLowerCase().trim();

    const exitCommands = [
      'exit', 'cancel', 'quit', 'stop', 'menu',
      'nvm', 'nevermind', 'never mind',
      'back', 'done', 'later',
      'wait', 'hold on', 'one sec', 'brb',
      'not now', 'not rn', 'gtg', 'busy'
    ];

    if (exitCommands.includes(lower)) {
      await setState(conv.id, 'authorized', {});
      return msg('SELL_DRAFT_SAVED');
    }

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
