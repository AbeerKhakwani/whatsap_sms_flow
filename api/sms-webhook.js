/**
 * WhatsApp Webhook - Conversational Sell Flow
 * States: welcome → awaiting_email → awaiting_description → awaiting_field → awaiting_confirmation → awaiting_photos → done
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'tps123';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// In-memory session store (will use Supabase later)
const sessions = new Map();

export default async function handler(req, res) {
  // Webhook verification (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) {
      return res.status(200).json({ status: 'no message' });
    }

    const phone = message.from;
    const session = getSession(phone);

    // Get message content
    let text = '';
    let buttonId = null;

    if (message.type === 'text') {
      text = message.text?.body?.trim() || '';
    } else if (message.type === 'interactive') {
      buttonId = message.interactive?.button_reply?.id;
    } else if (message.type === 'audio') {
      // Transcribe voice
      try {
        text = await transcribeVoice(message.audio.id);
        await sendMessage(phone, `🎤 I heard: "${text}"`);
      } catch (e) {
        await sendMessage(phone, "Couldn't transcribe that. Please type instead.");
        return res.status(200).json({ status: 'voice failed' });
      }
    } else if (message.type === 'image') {
      // Handle photo
      return await handlePhoto(phone, message.image.id, session, res);
    }

    const cmd = text.toLowerCase();
    console.log(`📱 ${phone} [${session.state}]: "${text}" btn=${buttonId}`);

    // Global commands
    if (cmd === 'cancel') {
      resetSession(phone);
      await sendMessage(phone, "Cancelled. Reply SELL to start over.");
      return res.status(200).json({ status: 'cancelled' });
    }

    if (cmd === 'info') {
      await sendMessage(phone,
        `🛍️ Shop: thephirstory.com\n` +
        `📧 Questions: admin@thephirstory.com\n` +
        `💬 Sell with us: Reply SELL`
      );
      return res.status(200).json({ status: 'info sent' });
    }

    // State machine
    switch (session.state) {
      case 'welcome':
        return await handleWelcome(phone, cmd, session, res);

      case 'awaiting_email':
        return await handleEmail(phone, text, session, res);

      case 'awaiting_description':
        return await handleDescription(phone, text, session, res);

      case 'awaiting_field':
        return await handleField(phone, text, buttonId, session, res);

      case 'awaiting_confirmation':
        return await handleConfirmation(phone, text, buttonId, session, res);

      case 'awaiting_photos':
        return await handlePhotosState(phone, text, buttonId, session, res);

      case 'done':
        return await handleWelcome(phone, cmd, session, res);

      default:
        return await handleWelcome(phone, cmd, session, res);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

// ============ State Handlers ============

async function handleWelcome(phone, cmd, session, res) {
  if (cmd === 'sell') {
    session.state = 'awaiting_email';
    saveSession(phone, session);
    await sendMessage(phone, "What's your email address?\n\n(Type CANCEL to start over)");
    return res.status(200).json({ status: 'asked email' });
  }

  await sendMessage(phone,
    `Hi! 👋 Welcome to The Phir Story.\n\n` +
    `• SELL - List an item\n` +
    `• INFO - Learn more`
  );
  return res.status(200).json({ status: 'welcome sent' });
}

async function handleEmail(phone, text, session, res) {
  const email = text.toLowerCase().trim();

  // Validate email format
  if (!email.includes('@') || !email.includes('.')) {
    await sendMessage(phone, "That doesn't look right. Please type your email (e.g., you@example.com)");
    return res.status(200).json({ status: 'invalid email' });
  }

  // Check if email exists and is linked to different phone
  const { data: existingSeller } = await supabase
    .from('sellers')
    .select('phone')
    .ilike('email', email)
    .maybeSingle();

  if (existingSeller?.phone && existingSeller.phone !== phone) {
    await sendMessage(phone, "This email is linked to a different phone. Text from that phone or email admin@thephirstory.com");
    return res.status(200).json({ status: 'email mismatch' });
  }

  // Save email and move to description
  session.email = email;
  session.state = 'awaiting_description';
  saveSession(phone, session);

  const greeting = existingSeller ? 'Welcome back! ✓' : 'Welcome! ✓';
  await sendMessage(phone,
    `${greeting}\n\n` +
    `Describe your item (text or voice):\n` +
    `• Designer/brand\n` +
    `• Size\n` +
    `• Condition\n` +
    `• Asking price\n\n` +
    `Example: "Sana Safinaz 3-piece, size M, like new, $80"`
  );
  return res.status(200).json({ status: 'asked description' });
}

async function handleDescription(phone, text, session, res) {
  if (!text) {
    await sendMessage(phone, "Please describe your item (text or voice message).");
    return res.status(200).json({ status: 'no description' });
  }

  // Extract fields with AI
  const extracted = await extractFields(text);
  session.listing = { ...extracted, description: text };
  saveSession(phone, session);

  // Check what's missing and ask
  return await askNextField(phone, session, res);
}

async function handleField(phone, text, buttonId, session, res) {
  const field = session.currentField;
  const value = buttonId || text;

  if (!value) {
    return res.status(200).json({ status: 'no value' });
  }

  // Handle "Other" button
  if (buttonId === 'other') {
    await sendMessage(phone, getOtherPrompt(field));
    return res.status(200).json({ status: 'asked other' });
  }

  // Save the field value
  session.listing[field] = value;
  saveSession(phone, session);

  // Ask next missing field
  return await askNextField(phone, session, res);
}

async function handleConfirmation(phone, text, buttonId, session, res) {
  const response = buttonId || text.toLowerCase();

  if (response === 'yes' || response === 'confirm') {
    session.state = 'awaiting_photos';
    session.photos = [];
    saveSession(phone, session);

    await sendMessage(phone,
      `Send 3+ photos:\n` +
      `📸 Front view\n` +
      `📸 Back view\n` +
      `📸 Brand tag\n\n` +
      `Send all at once or one by one.`
    );
    return res.status(200).json({ status: 'asked photos' });
  }

  if (response === 'update' || response === 'edit') {
    await sendButtons(phone, "What would you like to change?", [
      { id: 'edit_designer', title: 'Designer' },
      { id: 'edit_size', title: 'Size' },
      { id: 'edit_price', title: 'Price' }
    ]);
    return res.status(200).json({ status: 'asked what to edit' });
  }

  // Handle edit selection
  if (response.startsWith('edit_')) {
    const field = response.replace('edit_', '');
    session.currentField = field;
    session.state = 'awaiting_field';
    saveSession(phone, session);
    await sendMessage(phone, `What's the new ${field}?`);
    return res.status(200).json({ status: 'editing field' });
  }

  return res.status(200).json({ status: 'unknown confirmation' });
}

async function handlePhotosState(phone, text, buttonId, session, res) {
  if (buttonId === 'submit') {
    return await submitListing(phone, session, res);
  }

  if (buttonId === 'add_more') {
    await sendMessage(phone, "Send more photos. Tap SUBMIT when done.");
    return res.status(200).json({ status: 'waiting more photos' });
  }

  await sendMessage(phone, "Please send photos of your item.");
  return res.status(200).json({ status: 'waiting photos' });
}

async function handlePhoto(phone, mediaId, session, res) {
  // If not in photos state, save for later
  if (session.state !== 'awaiting_photos') {
    session.earlyPhotos = session.earlyPhotos || [];
    session.earlyPhotos.push(mediaId);
    saveSession(phone, session);
    await sendMessage(phone, "Got the photo! 📸 First, describe your item.");
    return res.status(200).json({ status: 'photo saved early' });
  }

  // Add photo
  session.photos = session.photos || [];
  session.photos.push(mediaId);
  saveSession(phone, session);

  const count = session.photos.length;

  if (count < 3) {
    await sendMessage(phone, `Got it! (${count} photo${count > 1 ? 's' : ''})`);
  } else {
    await sendMessage(phone, `Got it! (${count} photos) ✓`);
    await sendButtons(phone, "Ready to submit, or send more photos.", [
      { id: 'submit', title: 'SUBMIT ✓' },
      { id: 'add_more', title: 'ADD MORE' }
    ]);
  }

  return res.status(200).json({ status: 'photo received', count });
}

// ============ Helpers ============

async function askNextField(phone, session, res) {
  const listing = session.listing;
  const missing = getMissingFields(listing);

  if (missing.length === 0) {
    // All fields filled, show confirmation
    session.state = 'awaiting_confirmation';
    saveSession(phone, session);

    const summary = formatListingSummary(listing);
    await sendMessage(phone, `Here's your listing:\n\n${summary}`);
    await sendButtons(phone, "Look good?", [
      { id: 'yes', title: 'YES ✓' },
      { id: 'update', title: 'UPDATE' }
    ]);
    return res.status(200).json({ status: 'asked confirmation' });
  }

  // Ask for next missing field
  const field = missing[0];
  session.currentField = field;
  session.state = 'awaiting_field';
  saveSession(phone, session);

  const question = getFieldQuestion(field);
  if (question.buttons) {
    await sendButtons(phone, question.text, question.buttons);
  } else {
    await sendMessage(phone, question.text);
  }

  return res.status(200).json({ status: `asked ${field}` });
}

function getMissingFields(listing) {
  const required = ['designer', 'pieces', 'size', 'condition', 'price'];
  return required.filter(f => !listing[f]);
}

function getFieldQuestion(field) {
  switch (field) {
    case 'designer':
      return { text: "What's the designer/brand?" };
    case 'pieces':
      return {
        text: "What's included?",
        buttons: [
          { id: 'Kurta only', title: 'Kurta only' },
          { id: '2-piece', title: '2-piece' },
          { id: '3-piece', title: '3-piece' }
        ]
      };
    case 'size':
      return {
        text: "What size?",
        buttons: [
          { id: 'S', title: 'S' },
          { id: 'M', title: 'M' },
          { id: 'L', title: 'L' }
        ]
      };
    case 'condition':
      return {
        text: "What condition?",
        buttons: [
          { id: 'New with tags', title: 'New with tags' },
          { id: 'Like new', title: 'Like new' },
          { id: 'Gently used', title: 'Gently used' }
        ]
      };
    case 'price':
      return { text: "What's your asking price in USD?" };
    default:
      return { text: `What's the ${field}?` };
  }
}

function getOtherPrompt(field) {
  switch (field) {
    case 'pieces': return "What's included? (e.g., Kurta + dupatta only)";
    case 'size': return "Type your size (e.g., Chest 42)";
    case 'condition': return "Describe condition (e.g., Worn twice)";
    default: return `Please type the ${field}:`;
  }
}

function formatListingSummary(listing) {
  return `📦 ${listing.designer || 'Unknown'} - ${listing.pieces || 'Item'}\n` +
    `📏 Size: ${listing.size || '?'}\n` +
    `✨ Condition: ${listing.condition || '?'}\n` +
    `💰 Price: $${listing.price || '?'}\n` +
    (listing.details ? `📝 ${listing.details}` : '');
}

async function submitListing(phone, session, res) {
  // TODO: Create Shopify draft, upload photos
  const listing = session.listing;

  session.state = 'done';
  saveSession(phone, session);

  await sendMessage(phone,
    `🎉 Submitted for review!\n\n` +
    `📦 ${listing.designer} - ${listing.pieces}\n` +
    `📏 Size ${listing.size} | $${listing.price}\n\n` +
    `We'll notify you when it's live.\n\n` +
    `Reply SELL to list another item.`
  );

  return res.status(200).json({ status: 'submitted' });
}

async function extractFields(text) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract listing fields from description. Return JSON:
{
  "designer": "brand name or null",
  "pieces": "Kurta only|2-piece|3-piece or null",
  "size": "XS|S|M|L|XL or specific measurement or null",
  "condition": "New with tags|Like new|Gently used or null",
  "price": "number only or null",
  "details": "color, fabric, other details or null"
}`
        },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (e) {
    console.error('Extract error:', e);
    return {};
  }
}

// ============ Session Management ============

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, { state: 'welcome', listing: {}, photos: [] });
  }
  return sessions.get(phone);
}

function saveSession(phone, session) {
  sessions.set(phone, session);
}

function resetSession(phone) {
  sessions.set(phone, { state: 'welcome', listing: {}, photos: [] });
}

// ============ WhatsApp API ============

async function sendMessage(phone, text) {
  const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text }
    })
  });
  return response.json();
}

async function sendButtons(phone, text, buttons) {
  const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text },
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    })
  });
  return response.json();
}

async function transcribeVoice(mediaId) {
  // Get media URL
  const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const mediaInfo = await mediaRes.json();

  // Download audio
  const audioRes = await fetch(mediaInfo.url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const audioBuffer = await audioRes.arrayBuffer();

  // Transcribe
  const audioFile = new File([audioBuffer], 'voice.ogg', { type: 'audio/ogg' });
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'en'
  });

  return transcription.text;
}
