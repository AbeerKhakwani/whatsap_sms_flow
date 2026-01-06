/**
 * WhatsApp Webhook - Clean Router
 * Handles WhatsApp Cloud API (Meta) only
 */

import { msg } from '../lib/sms/messages.js';
import { normalizePhone, getGlobalCommand, logState } from '../lib/sms/helpers.js';
import { findSellerByPhone, findConversation, createConversation, updateConversation, setState, findDraftListing, isSessionExpired, revokeAuth, deleteListing } from '../lib/sms/db.js';
import { detectIntent } from '../lib/sms/intent.js';
import { handleAwaitingAccountCheck, handleAwaitingExistingEmail, handleAwaitingNewEmail, handleAwaitingEmail } from '../lib/sms/flows/auth.js';
import { handleSellFlow } from '../lib/sms/flows/sell.js';
import { processWhatsAppMedia } from '../lib/sms/media.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simple in-memory message dedup (for batching photos sent together)
const recentMessages = new Map();
const DEDUP_WINDOW_MS = 2000; // 2 second window to batch photos

// WhatsApp Cloud API config
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'phirstory_verify_token';

export default async function handler(req, res) {
  // WhatsApp webhook verification (GET request)
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
    // Parse WhatsApp Cloud API message
    const parsed = parseWhatsAppMessage(req.body);
    if (!parsed) {
      // Status update, not a message - acknowledge it
      return res.status(200).json({ status: 'ok' });
    }

    let { phone, message, mediaUrls, messageId, audioId } = parsed;

    // Deduplicate rapid photo messages (WhatsApp sends each photo separately)
    // If we got a photo with no text, batch it with others in the same window
    if (mediaUrls.length > 0 && !message && !audioId) {
      const dedupKey = `${phone}:photos`;
      const existing = recentMessages.get(dedupKey);
      const now = Date.now();

      if (existing && (now - existing.timestamp) < DEDUP_WINDOW_MS) {
        // Add to existing batch, don't respond yet
        existing.mediaUrls.push(...mediaUrls);
        existing.timestamp = now;
        console.log(`📸 Batching photo ${existing.mediaUrls.length} for ${phone}`);
        return res.status(200).json({ status: 'batched' });
      }

      // First photo in a potential batch - store it and wait
      recentMessages.set(dedupKey, { mediaUrls: [...mediaUrls], timestamp: now });

      // Wait briefly for more photos to arrive
      await new Promise(resolve => setTimeout(resolve, DEDUP_WINDOW_MS));

      // Now grab all batched photos
      const batch = recentMessages.get(dedupKey);
      recentMessages.delete(dedupKey);

      if (batch) {
        mediaUrls = batch.mediaUrls;
        console.log(`📸 Processing batch of ${mediaUrls.length} photos for ${phone}`);
      }
    }

    // Transcribe voice notes
    if (audioId) {
      const transcribedText = await transcribeVoiceNote(audioId);
      if (transcribedText) {
        message = transcribedText;
      } else {
        await sendWhatsAppMessage(phone, "Sorry, I couldn't hear that clearly. Could you type it out or try again?");
        return res.status(200).json({ status: 'ok' });
      }
    }

    // Load seller and conversation
    const seller = await findSellerByPhone(phone);
    let conv = await findConversation(phone);
    if (!conv) conv = await createConversation(phone, seller?.id);

    logState(phone, seller, conv);

    // Process media if present (use 'pending' as seller_id if not authenticated yet)
    let supabaseUrls = [];
    if (mediaUrls.length > 0) {
      const uploadSellerId = seller?.id || 'pending';
      supabaseUrls = await processWhatsAppMedia(mediaUrls, uploadSellerId, messageId);
    }

    // Route message and get response
    const response = await route(message, conv, seller, phone, supabaseUrls);

    // Send response via WhatsApp
    await sendWhatsAppMessage(phone, response);
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(200).json({ status: 'error', message: error.message });
  }
}

/**
 * Parse WhatsApp Cloud API message
 */
function parseWhatsAppMessage(body) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return null;
    }

    const msg = messages[0];
    const phone = normalizePhone(msg.from);
    const messageId = msg.id;

    let message = '';
    let mediaUrls = [];
    let audioId = null;

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
    } else if (msg.type === 'audio') {
      audioId = msg.audio.id;
    } else if (msg.type === 'interactive') {
      if (msg.interactive.type === 'button_reply') {
        message = msg.interactive.button_reply.id;
      } else if (msg.interactive.type === 'list_reply') {
        message = msg.interactive.list_reply.id;
      }
    }

    return { phone, message: message.trim(), mediaUrls, messageId, audioId };
  } catch (error) {
    console.error('Error parsing WhatsApp message:', error);
    return null;
  }
}

/**
 * Transcribe voice note using Whisper
 */
async function transcribeVoiceNote(audioId) {
  try {
    // Get download URL from WhatsApp
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v18.0/${audioId}`,
      { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const mediaData = await mediaResponse.json();
    const downloadUrl = mediaData.url;

    // Download audio file
    const audioResponse = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    });
    const audioBuffer = await audioResponse.arrayBuffer();

    // Transcribe with Whisper
    const audioFile = new File([audioBuffer], 'voice.ogg', { type: 'audio/ogg' });
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    console.log('🎤 Transcribed:', transcription.text);
    return transcription.text;
  } catch (error) {
    console.error('Voice transcription error:', error);
    return null;
  }
}

/**
 * Send WhatsApp message (text, buttons, or template)
 */
async function sendWhatsAppMessage(phone, content) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.error('❌ WhatsApp credentials not configured');
    return;
  }

  const to = phone.replace('+', '');
  let body;

  if (typeof content === 'object' && content.template) {
    // Template message
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: content.template,
        language: { code: 'en_US' }
      }
    };
    if (content.params?.length > 0) {
      body.template.components = [{
        type: 'body',
        parameters: content.params.map(p => ({ type: 'text', text: p }))
      }];
    }
  } else if (typeof content === 'object' && content.buttons) {
    // Interactive button message
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: content.text },
        action: {
          buttons: content.buttons.map(btn => ({
            type: 'reply',
            reply: { id: btn.id, title: btn.title }
          }))
        }
      }
    };
  } else {
    // Plain text message
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: content }
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ WhatsApp API error:', error);
    }
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
  }
}

/**
 * Route message to appropriate handler
 */
async function route(message, conv, seller, phone, supabaseUrls = []) {
  const state = conv.state || 'new';

  // If no seller but conversation thinks authorized, force re-auth
  if (!seller && (conv.is_authorized || state.startsWith('sell_') || state === 'authorized')) {
    await updateConversation(conv.id, {
      state: 'awaiting_account_check',
      is_authorized: false,
      context: {}
    });
    return msg('WELCOME_NEW_USER');
  }

  // Global commands
  const cmd = getGlobalCommand(message);
  if (cmd === 'HELP') return msg('HELP');
  if (cmd === 'STOP') {
    await setState(conv.id, 'unsubscribed');
    return msg('STOP');
  }
  if (cmd === 'LOGOUT') {
    await revokeAuth(conv.id);
    await setState(conv.id, 'awaiting_action');
    return msg('LOGOUT');
  }
  if (cmd === 'START' || cmd === 'MENU') {
    if (conv.is_authorized && isSessionExpired(conv)) {
      await revokeAuth(conv.id);
      await setState(conv.id, 'awaiting_email', { pending_intent: null });
      return msg('SESSION_EXPIRED');
    }
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

  // Check session expiry
  if (conv.is_authorized && isSessionExpired(conv)) {
    await revokeAuth(conv.id);
    await setState(conv.id, 'awaiting_email', { pending_intent: null });
    return msg('SESSION_EXPIRED');
  }

  // Media with no sell flow = start sell
  if (supabaseUrls.length > 0 && seller && !state.startsWith('sell_')) {
    if (!conv.is_authorized) {
      await setState(conv.id, 'awaiting_email', { pending_intent: 'sell', media_urls: supabaseUrls });
      return msg('ASK_EMAIL_VERIFY');
    }

    const draft = await findDraftListing(seller.id);
    if (draft) {
      await setState(conv.id, 'sell_draft_check', {
        listing_id: draft.id,
        pending_media_urls: supabaseUrls
      });
      return msg('SELL_DRAFT_FOUND', draft.designer || '', draft.item_type || '');
    }

    await setState(conv.id, 'sell_started', { media_urls: supabaseUrls });
    return msg('SELL_START');
  }

  // Blocked if unsubscribed
  if (state === 'unsubscribed') return msg('UNSUBSCRIBED_BLOCK');

  // Auth states
  if (state === 'awaiting_account_check') return handleAwaitingAccountCheck(message, conv, phone);
  if (state === 'awaiting_existing_email') return handleAwaitingExistingEmail(message, conv, phone);
  if (state === 'awaiting_new_email') return handleAwaitingNewEmail(message, conv, phone);
  if (state === 'awaiting_email') return handleAwaitingEmail(message, conv, seller);

  // Draft check
  if (state === 'sell_draft_check') {
    const lower = message.toLowerCase().trim();
    const pendingPhotos = conv.context?.pending_media_urls || [];
    const listingId = conv.context?.listing_id;
    const draft = listingId ? await findDraftListing(seller.id) : null;

    if (['continue', 'c', '1'].includes(lower) && draft) {
      await setState(conv.id, 'sell_awaiting_text', { listing_id: draft.id });
      return `Let's continue! ${draft.designer ? `You were listing a ${draft.designer}.` : ''} What else can you tell me?`;
    }

    if (['new', 'n', '2'].includes(lower)) {
      if (draft) await deleteListing(draft.id);
      await setState(conv.id, 'sell_started', { media_urls: pendingPhotos });
      return msg('SELL_DRAFT_DELETED');
    }

    return msg('SELL_DRAFT_FOUND', draft?.designer || '', draft?.item_type || '');
  }

  // Sell flow
  if (state.startsWith('sell_')) {
    const lower = message.toLowerCase().trim();
    const listingId = conv.context?.listing_id;

    if (['start over', 'startover', 'clear', 'reset', 'delete draft'].includes(lower)) {
      // Delete the listing from DB too
      if (listingId) await deleteListing(listingId);
      await setState(conv.id, 'authorized', {});
      return msg('SELL_DRAFT_DELETED');
    }

    const exitCommands = ['exit', 'cancel', 'quit', 'nvm', 'nevermind', 'never mind', 'back', 'done', 'later', 'wait', 'hold on', 'one sec', 'brb', 'not now', 'not rn', 'gtg', 'busy'];
    if (exitCommands.includes(lower)) {
      // Keep listing_id in context so they can resume
      await setState(conv.id, 'authorized', { listing_id: listingId });
      return msg('SELL_DRAFT_SAVED');
    }

    const allUrls = [...(conv.context?.media_urls || []), ...supabaseUrls];
    return handleSellFlow(message, conv, seller, allUrls);
  }

  // New user
  if (state === 'new') {
    if (seller) {
      await updateConversation(conv.id, { state: 'awaiting_action', seller_id: seller.id });
      return msg('WELCOME_KNOWN_SELLER');
    }
    await setState(conv.id, 'awaiting_account_check');
    return msg('WELCOME_NEW_USER');
  }

  // Ready for action
  if (state === 'awaiting_action' || state === 'authorized') {
    const intent = await detectIntent(message);

    if (intent === 'sell') {
      if (!seller) {
        await setState(conv.id, 'awaiting_account_check');
        return msg('WELCOME_NEW_USER');
      }
      if (!conv.is_authorized) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'sell' });
        return msg('ASK_EMAIL_VERIFY');
      }

      const draft = await findDraftListing(seller.id);
      if (draft) {
        await setState(conv.id, 'sell_draft_check', { listing_id: draft.id });
        return msg('SELL_DRAFT_FOUND', draft.designer || '', draft.item_type || '');
      }

      await setState(conv.id, 'sell_started', {});
      return msg('SELL_START');
    }

    if (intent === 'offer') {
      if (!seller) {
        await setState(conv.id, 'awaiting_account_check');
        return msg('WELCOME_NEW_USER');
      }
      if (!conv.is_authorized) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'offer' });
        return msg('ASK_EMAIL_VERIFY');
      }
      return msg('OFFER_START');
    }

    if (intent === 'listings') {
      if (!seller) {
        await setState(conv.id, 'awaiting_account_check');
        return msg('WELCOME_NEW_USER');
      }
      if (!conv.is_authorized) {
        await setState(conv.id, 'awaiting_email', { pending_intent: 'listings' });
        return msg('ASK_EMAIL_VERIFY');
      }
      return msg('LISTINGS_START');
    }

    return msg('MENU');
  }

  return msg('MENU');
}
