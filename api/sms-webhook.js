/**
 * WhatsApp Webhook V2 - With Redis, Shopify GraphQL, and Enhanced Auth
 *
 * Key improvements:
 * - Email verification with codes
 * - Redis for atomic photo operations (no race conditions)
 * - Shopify GraphQL for uploads (no productId needed upfront)
 * - sms_conversations table for state management
 * - sell_editing state for field corrections
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import crypto from 'crypto';
import * as smsDb from '../lib/sms-db.js';
import * as redisPhotos from '../lib/redis-photos.js';
import * as shopifyGraphQL from '../lib/shopify-graphql.js';

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'tps123';
const API_BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://sell.thephirstory.com';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Required fields (in order)
const REQUIRED_FIELDS = ['designer', 'pieces_included', 'size', 'condition', 'asking_price_usd'];

// Field labels for user-facing messages
const FIELD_LABELS = {
  designer: 'Designer',
  pieces_included: 'Pieces included',
  size: 'Size',
  condition: 'Condition',
  asking_price_usd: 'Price'
};

// Dropdown options with keywords for smart matching
const DROPDOWN_OPTIONS = {
  pieces_included: [
    { value: 'Kurta', label: 'Kurta only', keywords: ['kurta', 'kameez', 'single', '1 piece', '1-piece', 'one piece'] },
    { value: '2-piece', label: '2-piece', keywords: ['2 piece', '2-piece', 'two piece', 'shirt pants', 'shirt trouser', 'dupatta'] },
    { value: '3-piece', label: '3-piece', keywords: ['3 piece', '3-piece', 'three piece', 'suit', 'complete', 'full set'] }
  ],
  size: [
    { value: 'XS', label: 'XS', keywords: ['xs', 'extra small', 'xsmall'] },
    { value: 'S', label: 'S', keywords: ['s', 'small', 'sm'] },
    { value: 'M', label: 'M', keywords: ['m', 'medium', 'med'] },
    { value: 'L', label: 'L', keywords: ['l', 'large', 'lg'] },
    { value: 'XL', label: 'XL', keywords: ['xl', 'extra large', 'xlarge'] },
    { value: 'XXL', label: 'XXL', keywords: ['xxl', '2xl', 'double xl'] },
    { value: 'One Size', label: 'One Size', keywords: ['one size', 'free size', 'fits all'] },
    { value: 'Unstitched', label: 'Unstitched', keywords: ['unstitched', 'not stitched', 'fabric only'] },
    { value: 'Measurements', label: 'Measurements', keywords: ['measurements', 'custom', 'specific size'] }
  ],
  condition: [
    { value: 'New with tags', label: 'New with tags', keywords: ['new with tags', 'nwt', 'brand new', 'never worn', 'tags attached'] },
    { value: 'Like new', label: 'Like new', keywords: ['like new', 'worn once', 'excellent', 'perfect condition', 'mint'] },
    { value: 'Excellent', label: 'Excellent', keywords: ['excellent', 'great condition', 'barely worn'] },
    { value: 'Good', label: 'Good', keywords: ['good', 'good condition', 'worn few times', 'gently used'] },
    { value: 'Fair', label: 'Fair', keywords: ['fair', 'used', 'some wear', 'visible wear'] }
  ]
};

// ============ UTILITY FUNCTIONS ============

function normalizeInput(text) {
  if (!text) return '';
  return text
    .replace(/\bNWT\b/ig, 'New with tags')
    .replace(/\bNWOT\b/ig, 'New without tags')
    .replace(/\bEUC\b/ig, 'Excellent')
    .replace(/\$\s*(\d+)/g, '$1')
    .trim();
}

function matchToDropdown(text, field) {
  if (!text) return '';
  const options = DROPDOWN_OPTIONS[field] || [];
  const lowerText = text.toLowerCase().trim();

  // Direct match
  for (const opt of options) {
    if (opt.value && opt.value.toLowerCase() === lowerText) {
      return opt.value;
    }
  }

  // Keyword match
  for (const opt of options) {
    if (opt.keywords?.some(kw => lowerText.includes(kw))) {
      return opt.value;
    }
  }

  return '';
}

function isNonEmpty(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

function getMissingFields(listing) {
  return REQUIRED_FIELDS.filter(f => !isNonEmpty(listing?.[f]));
}

/**
 * Compress and resize image buffer to optimized JPEG
 */
async function compressImage(buffer) {
  try {
    const out = await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    console.log(`📸 Compressed: ${buffer.length} bytes → ${out.length} bytes (${Math.round(out.length / buffer.length * 100)}%)`);
    return out;
  } catch (error) {
    console.error('❌ Image compression error:', error);
    return buffer; // Fallback to original
  }
}

// ============ AUTH CODE GENERATION ============

/**
 * Generate and save 6-digit auth code
 */
async function generateAuthCode(email, phone) {
  const code = crypto.randomInt(100000, 999999).toString();

  const { error } = await supabase
    .from('auth_codes')
    .insert({
      identifier: email.toLowerCase(),
      code,
      channel: 'whatsapp',
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    });

  if (error) {
    console.error('❌ Error saving auth code:', error);
    throw error;
  }

  console.log(`✅ Generated auth code for ${email}`);
  return code;
}

/**
 * Verify auth code
 */
async function verifyAuthCode(email, code) {
  const { data, error } = await supabase
    .from('auth_codes')
    .select('*')
    .eq('identifier', email.toLowerCase())
    .eq('code', code)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  // Mark as used
  await supabase
    .from('auth_codes')
    .update({ used: true })
    .eq('id', data.id);

  return true;
}

// ============ WHATSAPP API HELPERS ============

async function sendMessage(phone, text) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function sendButtons(phone, text, buttons) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
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
          buttons: buttons.map(btn => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title.substring(0, 20) // WhatsApp limit
            }
          }))
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function sendList(phone, text, buttonText, sections) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
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
        type: 'list',
        body: { text },
        action: {
          button: buttonText,
          sections: sections
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function downloadMedia(mediaId) {
  // Get media URL
  const urlResponse = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });

  if (!urlResponse.ok) {
    throw new Error('Failed to get media URL');
  }

  const { url } = await urlResponse.json();

  // Download media
  const mediaResponse = await fetch(url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });

  if (!mediaResponse.ok) {
    throw new Error('Failed to download media');
  }

  const arrayBuffer = await mediaResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============ AI EXTRACTION ============

async function extractListingData(description) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.warn('⚠️ No OpenAI key - using basic extraction');
    return {};
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a fashion listing assistant. Extract structured data from user descriptions.

VALID VALUES ONLY:
- pieces_included: "Kurta", "2-piece", "3-piece"
- size: "XS", "S", "M", "L", "XL", "XXL", "One Size", "Unstitched", "Measurements"
- condition: "New with tags", "Like new", "Excellent", "Good", "Fair"

Return JSON with ONLY the fields you find. Leave missing fields empty.`
          },
          {
            role: 'user',
            content: description
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const extracted = JSON.parse(data.choices[0].message.content);

    // Normalize and validate
    const result = {};

    if (extracted.designer) result.designer = extracted.designer;
    if (extracted.item_type) result.item_type = extracted.item_type;
    if (extracted.description) result.description = extracted.description;

    // Match dropdown fields
    if (extracted.pieces_included) {
      const matched = matchToDropdown(extracted.pieces_included, 'pieces_included');
      if (matched) result.pieces_included = matched;
    }

    if (extracted.size) {
      const matched = matchToDropdown(extracted.size, 'size');
      if (matched) result.size = matched;
    }

    if (extracted.condition) {
      const matched = matchToDropdown(extracted.condition, 'condition');
      if (matched) result.condition = matched;
    }

    // Extract price
    if (extracted.asking_price_usd || extracted.price) {
      const price = extracted.asking_price_usd || extracted.price;
      const numPrice = typeof price === 'number' ? price : parseInt(String(price).replace(/\D/g, ''));
      if (!isNaN(numPrice) && numPrice > 0) {
        result.asking_price_usd = numPrice;
      }
    }

    console.log('🤖 AI extracted:', result);
    return result;

  } catch (error) {
    console.error('❌ AI extraction error:', error);
    return {};
  }
}

// ============ MAIN HANDLER ============

export default async function handler(req, res) {
  // Webhook verification (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified - V2');
      return res.status(200).send(challenge);
    }
    if (req.query.version === 'check') {
      return res.status(200).json({ version: '2.0', updated: '2026-01-09 V2' });
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
    const messageId = message.id;

    // Get or create conversation
    const conv = await smsDb.findOrCreateConversation(phone);

    // Idempotency: Skip if we've already processed this message
    if (await smsDb.isMessageProcessed(phone, messageId)) {
      console.log(`⏭️  Skipping duplicate message ${messageId}`);
      return res.status(200).json({ status: 'duplicate' });
    }

    // Mark as processed immediately
    await smsDb.markMessageProcessed(phone, messageId);

    // Parse message
    let text = '';
    let buttonId = null;

    if (message.type === 'text') {
      text = message.text?.body?.trim() || '';
    } else if (message.type === 'interactive') {
      buttonId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
      text = buttonId || '';
    } else if (message.type === 'audio') {
      // Transcribe voice message
      try {
        text = await transcribeAudio(message.audio.id);
        await sendMessage(phone, `🎤 I heard: "${text}"`);
      } catch (e) {
        console.error('❌ Transcription error:', e);
        await sendMessage(phone, "Couldn't transcribe. Please type instead.");
        return res.status(200).json({ status: 'transcription failed' });
      }
    } else if (message.type === 'image') {
      return await handlePhoto(phone, message.image.id, conv, res);
    }

    const cmd = text.toLowerCase();
    console.log(`📱 ${phone} [${conv.state}]: "${text}"`);

    // Global commands
    if (cmd === 'cancel') {
      // Clean up Redis and Shopify files
      const fileIds = conv.context?.shopify_file_ids || [];
      if (fileIds.length > 0) {
        await shopifyGraphQL.deleteFiles(fileIds);
      }
      await redisPhotos.clearPhotos(phone);
      await smsDb.resetConversation(phone);
      await sendMessage(phone, "Cancelled. Reply SELL to start over.");
      return res.status(200).json({ status: 'cancelled' });
    }

    if (cmd === 'sell') {
      return await handleSellCommand(phone, conv, res);
    }

    // State machine
    switch (conv.state) {
      case 'new':
      case 'welcome':
        await sendWelcome(phone);
        return res.status(200).json({ status: 'welcome' });

      case 'awaiting_email':
        return await handleEmail(phone, text, conv, res);

      case 'awaiting_code':
        return await handleCode(phone, text, conv, res);

      case 'awaiting_description':
        return await handleDescription(phone, text, conv, res);

      case 'sell_collecting':
        return await handleMissingField(phone, text, buttonId, conv, res);

      case 'sell_photos':
        return await handlePhotoState(phone, text, buttonId, conv, res);

      case 'awaiting_additional_details':
        return await handleAdditionalDetails(phone, text, buttonId, conv, res);

      case 'awaiting_additional_details_text':
        return await handleAdditionalDetailsText(phone, text, conv, res);

      case 'sell_confirming':
        return await handleConfirmation(phone, text, buttonId, conv, res);

      case 'sell_editing':
        return await handleEditing(phone, text, buttonId, conv, res);

      default:
        await sendWelcome(phone);
        return res.status(200).json({ status: 'welcome' });
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

// ============ STATE HANDLERS ============

async function sendWelcome(phone) {
  await sendMessage(phone, `Hi! 👋 Welcome to The Phir Story.\n\n• Reply SELL to list an item\n• Visit thephirstory.com to shop`);
}

async function handleSellCommand(phone, conv, res) {
  // Check if already authorized
  if (conv.is_authorized && conv.seller_id) {
    console.log(`✅ ${phone} already authorized - starting fresh sell flow`);

    // Clean up any previous flow
    const oldFileIds = conv.context?.shopify_file_ids || [];
    if (oldFileIds.length > 0) {
      await shopifyGraphQL.deleteFiles(oldFileIds);
    }
    await redisPhotos.clearPhotos(phone);

    // Reset to fresh sell flow
    await smsDb.updateContext(phone, {
      listing_data: {},
      shopify_file_ids: [],
      current_field: null
    });
    await smsDb.setState(phone, 'awaiting_description');

    await sendMessage(phone, `Welcome back! ✓\n\nDescribe your item (voice or text):\nDesigner, size, condition, price\n\nExample: "Maria B lawn 3pc, M, like new, $80"`);
    return res.status(200).json({ status: 'asked description' });
  }

  // Not authorized - ask for email
  await smsDb.setState(phone, 'awaiting_email');
  await sendMessage(phone, "What's your email?");
  return res.status(200).json({ status: 'asked email' });
}

async function handleEmail(phone, text, conv, res) {
  const email = text.toLowerCase().trim();

  // Validate email format
  if (!email.includes('@') || !email.includes('.')) {
    await sendMessage(phone, "Hmm, that doesn't look right.\nTry: you@example.com");
    return res.status(200).json({ status: 'invalid email' });
  }

  // Check if seller exists
  const sellerByEmail = await smsDb.findSellerByEmail(email);
  const sellerByPhone = await smsDb.findSellerByPhone(phone);

  // Case 1: Email exists but phone doesn't match
  if (sellerByEmail && !smsDb.normalizePhone(sellerByEmail.phone).endsWith(smsDb.normalizePhone(phone).slice(-10))) {
    await sendMessage(phone, `That email is registered to a different number.\n\nPlease use your registered number or contact support.`);
    return res.status(200).json({ status: 'email mismatch' });
  }

  // Case 2: Phone exists but email doesn't match
  if (sellerByPhone && sellerByPhone.email && sellerByPhone.email.toLowerCase() !== email) {
    await sendMessage(phone, `This number is registered with ${sellerByPhone.email}.\n\nPlease use that email or contact support.`);
    return res.status(200).json({ status: 'phone mismatch' });
  }

  // Generate and send code
  const code = await generateAuthCode(email, phone);

  // Save email to context
  await smsDb.updateContext(phone, { email, pending_seller_id: sellerByEmail?.id || sellerByPhone?.id || null });
  await smsDb.setState(phone, 'awaiting_code');

  await sendMessage(phone, `Check your email for your code.\n\nReply with the 6-digit code to verify.\n\nCode: ${code}`);
  return res.status(200).json({ status: 'sent code' });
}

async function handleCode(phone, text, conv, res) {
  const code = text.trim();
  const email = conv.context?.email;

  if (!email) {
    await sendMessage(phone, "Error: Email not found. Reply SELL to start over.");
    return res.status(200).json({ status: 'no email' });
  }

  // Verify code
  const valid = await verifyAuthCode(email, code);

  if (!valid) {
    const attempts = await smsDb.incrementAuthAttempts(phone);

    if (attempts >= 3) {
      await smsDb.setState(phone, 'new');
      await sendMessage(phone, "Too many failed attempts. Reply SELL to try again.");
      return res.status(200).json({ status: 'too many attempts' });
    }

    await sendMessage(phone, `Invalid code. ${3 - attempts} attempts remaining.\n\nTry again or reply SELL to restart.`);
    return res.status(200).json({ status: 'invalid code' });
  }

  // Code valid! Find or create seller
  let seller = await smsDb.findSellerByEmail(email);

  if (!seller) {
    seller = await smsDb.createSeller({ phone, email });
  }

  // Authorize conversation
  await smsDb.authorize(phone, seller.id, email);

  // Start sell flow
  await smsDb.setState(phone, 'awaiting_description');

  const greeting = seller.name ? `Welcome back, ${seller.name}! ✓` : `Welcome! ✓`;
  await sendMessage(phone, `${greeting}\n\nDescribe your item (voice or text):\nDesigner, size, condition, price\n\nExample: "Maria B lawn 3pc, M, like new, $80"`);

  return res.status(200).json({ status: 'authorized' });
}

async function handleDescription(phone, text, conv, res) {
  if (!text || text.trim().length < 5) {
    await sendMessage(phone, "Please describe your item:\nDesigner, size, condition, price");
    return res.status(200).json({ status: 'description too short' });
  }

  // Extract with AI
  const extracted = await extractListingData(text);

  // Save to context
  await smsDb.updateContext(phone, {
    listing_data: {
      ...extracted,
      description: text
    }
  });

  // Move to collecting missing fields
  await smsDb.setState(phone, 'sell_collecting');

  // Show what we extracted (like V1)
  const confirmations = [];
  if (extracted.designer) confirmations.push(`Designer: ${extracted.designer} ✓`);
  if (extracted.pieces_included) confirmations.push(`Pieces: ${extracted.pieces_included} ✓`);
  if (extracted.size) confirmations.push(`Size: ${extracted.size} ✓`);
  if (extracted.condition) confirmations.push(`Condition: ${extracted.condition} ✓`);
  if (extracted.asking_price_usd) confirmations.push(`Price: $${extracted.asking_price_usd} ✓`);

  if (confirmations.length > 0) {
    await sendMessage(phone, `Got it!\n\n${confirmations.join('\n')}`);
  }

  // Ask for first missing field
  return await askNextMissingField(phone, res);
}

async function askNextMissingField(phone, res) {
  const conv = await smsDb.getConversation(phone);
  const listing = conv.context?.listing_data || {};
  const missing = getMissingFields(listing);

  if (missing.length === 0) {
    // All fields complete - move to photos
    await smsDb.setState(phone, 'sell_photos');
    await sendMessage(phone, "Great! 📸\n\nNow send at least 3 photos of your item.\n\nText DONE when finished.");
    return res.status(200).json({ status: 'asked photos' });
  }

  // Ask for next missing field
  const field = missing[0];
  await smsDb.updateContext(phone, { current_field: field });

  const label = FIELD_LABELS[field] || field;
  const prompt = `What's the ${label}?`;

  // Show list/buttons for dropdown fields
  if (DROPDOWN_OPTIONS[field]) {
    const options = DROPDOWN_OPTIONS[field];

    // Use WhatsApp List for all dropdown fields
    const rows = options.map(opt => ({
      id: `${field}_${opt.value.toLowerCase().replace(/\s+/g, '_')}`,
      title: opt.label,
      description: '' // Optional
    }));

    const sections = [{
      title: label,
      rows: rows
    }];

    await sendList(phone, prompt, 'Select', sections);
  } else {
    // For text fields (designer, price)
    await sendMessage(phone, prompt);
  }

  return res.status(200).json({ status: `asked ${field}` });
}

async function handleMissingField(phone, text, buttonId, conv, res) {
  const field = conv.context?.current_field;
  if (!field) {
    return await askNextMissingField(phone, res);
  }

  // Handle button clicks (buttonId format: "field_value")
  if (buttonId && buttonId.startsWith(`${field}_`)) {
    const buttonValue = buttonId.replace(`${field}_`, '').replace(/_/g, ' ');
    // Match button value to dropdown option
    const matched = matchToDropdown(buttonValue, field);
    if (matched) {
      const listing = conv.context?.listing_data || {};
      listing[field] = matched;
      await smsDb.updateContext(phone, { listing_data: listing });
      console.log(`✅ Saved ${field} = ${matched} (via button)`);
      return await askNextMissingField(phone, res);
    }
  }

  const normalized = normalizeInput(text);
  let value = normalized;

  // Match dropdown fields (for text input)
  if (DROPDOWN_OPTIONS[field]) {
    const matched = matchToDropdown(normalized, field);
    if (!matched) {
      const options = DROPDOWN_OPTIONS[field].map(opt => opt.label).join(', ');
      await sendMessage(phone, `Please choose from: ${options}`);
      return res.status(200).json({ status: 'invalid option' });
    }
    value = matched;
  }

  // Validate price
  if (field === 'asking_price_usd') {
    const price = parseInt(value.replace(/\D/g, ''));
    if (isNaN(price) || price <= 0) {
      await sendMessage(phone, "Please enter a valid price (e.g., 50 or $50)");
      return res.status(200).json({ status: 'invalid price' });
    }
    value = price;
  }

  // Save field
  const listing = conv.context?.listing_data || {};
  listing[field] = value;
  await smsDb.updateContext(phone, { listing_data: listing });

  console.log(`✅ Saved ${field} = ${value}`);

  // Show updated summary (like V1)
  const summary = formatListingSummary(listing);
  await sendMessage(phone, summary);

  // Ask next missing field
  return await askNextMissingField(phone, res);
}

async function handlePhoto(phone, mediaId, conv, res) {
  // Check state
  if (conv.state !== 'sell_photos') {
    console.log(`⚠️  Photo received in wrong state: ${conv.state}`);
    return res.status(200).json({ status: 'wrong state' });
  }

  // Redis deduplication
  const claimed = await redisPhotos.claimPhoto(phone, mediaId);
  if (!claimed) {
    console.log(`⏭️  Duplicate photo: ${mediaId}`);
    return res.status(200).json({ status: 'duplicate photo' });
  }

  try {
    // Download and compress
    console.log(`📥 Downloading media: ${mediaId}`);
    const buffer = await downloadMedia(mediaId);
    console.log(`✅ Downloaded: ${buffer.length} bytes`);

    console.log(`🗜️ Compressing image...`);
    const compressed = await compressImage(buffer);
    console.log(`✅ Compressed: ${compressed.length} bytes`);

    // Upload to Shopify GraphQL (no productId needed!)
    console.log(`📤 Uploading to Shopify...`);
    const fileId = await shopifyGraphQL.uploadPhotoToShopify(compressed, `wa_${mediaId}.jpg`);
    console.log(`✅ Shopify file ID: ${fileId}`);

    // Add to Redis
    const count = await redisPhotos.addPhoto(phone, fileId, mediaId);

    // Also backup to context
    const currentFileIds = conv.context?.shopify_file_ids || [];
    currentFileIds.push(fileId);
    await smsDb.updateContext(phone, { shopify_file_ids: currentFileIds });

    console.log(`✅ Photo ${count} uploaded: ${fileId}`);

    // Send confirmation on first photo only
    if (count === 1) {
      await sendMessage(phone, "Got it! 📸\n\nKeep sending. Text DONE when finished.");
    }

    return res.status(200).json({ status: 'photo saved', count });

  } catch (error) {
    console.error('❌ Photo upload error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    await sendMessage(phone, "That photo didn't upload. Please resend it 📸");
    return res.status(200).json({ status: 'upload failed', error: error.message });
  }
}

async function handlePhotoState(phone, text, buttonId, conv, res) {
  const userText = (text || '').trim().toLowerCase();

  if (userText === 'done') {
    // Get photos from Redis
    const fileIds = await redisPhotos.getPhotos(phone);
    const photoCount = fileIds.length;

    console.log(`✅ User done. Photos in Redis: ${photoCount}`);

    if (photoCount < 3) {
      await sendMessage(phone, `Need at least 3 photos. You have ${photoCount}. Send ${3 - photoCount} more 📸`);
      return res.status(200).json({ status: 'need more photos' });
    }

    // Transfer to context (already backed up during upload, but ensure it's synced)
    await smsDb.updateContext(phone, { shopify_file_ids: fileIds });

    // Clear Redis
    await redisPhotos.clearPhotos(phone);

    // Move to next state
    await smsDb.setState(phone, 'awaiting_additional_details');

    await sendButtons(phone,
      `Great! Got ${photoCount} photo${photoCount !== 1 ? 's' : ''} 📸\n\nAny flaws or special notes?`,
      [
        { id: 'skip_details', title: 'NO, SKIP' },
        { id: 'add_details', title: 'YES, ADD' }
      ]
    );

    return res.status(200).json({ status: 'asked details' });
  }

  // Any other text
  await sendMessage(phone, "Send photos or text DONE when finished! 📸");
  return res.status(200).json({ status: 'waiting' });
}

async function handleAdditionalDetails(phone, text, buttonId, conv, res) {
  if (buttonId === 'skip_details' || text.toLowerCase() === 'skip') {
    return await showSummary(phone, conv, res);
  }

  if (buttonId === 'add_details' || text.toLowerCase().includes('yes')) {
    await smsDb.setState(phone, 'awaiting_additional_details_text');
    await sendMessage(phone, "What should buyers know? (flaws, measurements, notes)");
    return res.status(200).json({ status: 'asked details text' });
  }

  return await showSummary(phone, conv, res);
}

async function handleAdditionalDetailsText(phone, text, conv, res) {
  // Save additional details
  const listing = conv.context?.listing_data || {};
  listing.additional_details = text.trim();
  await smsDb.updateContext(phone, { listing_data: listing });

  return await showSummary(phone, conv, res);
}

async function showSummary(phone, conv, res) {
  const listing = conv.context?.listing_data || {};
  const photoCount = (conv.context?.shopify_file_ids || []).length;

  await smsDb.setState(phone, 'sell_confirming');

  const summary =
    `📋 *Ready to submit!*\n\n` +
    `📦 ${listing.designer} ${listing.item_type || ''}\n` +
    `📏 Size: ${listing.size}\n` +
    `🎨 Pieces: ${listing.pieces_included}\n` +
    `✨ Condition: ${listing.condition}\n` +
    `💰 Price: $${listing.asking_price_usd}\n` +
    `📸 Photos: ${photoCount}\n` +
    (listing.additional_details ? `📝 Notes: ${listing.additional_details}\n` : '') +
    `\nLook good?`;

  await sendButtons(phone, summary, [
    { id: 'submit', title: 'YES, SUBMIT ✓' },
    { id: 'edit_fields', title: 'EDIT' },
    { id: 'cancel', title: 'CANCEL' }
  ]);

  return res.status(200).json({ status: 'showed summary' });
}

async function handleConfirmation(phone, text, buttonId, conv, res) {
  const response = (buttonId || text).toLowerCase();

  if (response === 'submit' || response === 'yes') {
    return await submitListing(phone, conv, res);
  }

  if (response === 'edit_fields' || response === 'edit') {
    return await showEditMenu(phone, conv, res);
  }

  if (response === 'cancel') {
    const fileIds = conv.context?.shopify_file_ids || [];
    if (fileIds.length > 0) {
      await shopifyGraphQL.deleteFiles(fileIds);
    }
    await smsDb.resetConversation(phone);
    await sendMessage(phone, "Cancelled. Reply SELL to start over.");
    return res.status(200).json({ status: 'cancelled' });
  }

  // Unknown response - show summary again
  return await showSummary(phone, conv, res);
}

async function showEditMenu(phone, conv, res) {
  const listing = conv.context?.listing_data || {};

  await smsDb.setState(phone, 'sell_editing');

  const menu =
    `What would you like to edit?\n\n` +
    `1️⃣ Designer: ${listing.designer}\n` +
    `2️⃣ Pieces: ${listing.pieces_included}\n` +
    `3️⃣ Size: ${listing.size}\n` +
    `4️⃣ Condition: ${listing.condition}\n` +
    `5️⃣ Price: $${listing.asking_price_usd}\n` +
    `6️⃣ Notes: ${listing.additional_details || 'None'}\n\n` +
    `Reply with the number (1-6) or BACK to return.`;

  await sendMessage(phone, menu);
  return res.status(200).json({ status: 'showed edit menu' });
}

async function handleEditing(phone, text, buttonId, conv, res) {
  const input = text.trim();

  // Check if we're waiting for a new value
  if (conv.context?.sub_state === 'awaiting_edit_value') {
    const field = conv.context?.editing_field;
    if (!field) {
      return await showEditMenu(phone, conv, res);
    }

    const normalized = normalizeInput(input);
    let value = normalized;

    // Match dropdown fields
    if (DROPDOWN_OPTIONS[field]) {
      const matched = matchToDropdown(normalized, field);
      if (!matched) {
        const options = DROPDOWN_OPTIONS[field].map(opt => opt.label).join(', ');
        await sendMessage(phone, `Please choose from: ${options}`);
        return res.status(200).json({ status: 'invalid option' });
      }
      value = matched;
    }

    // Validate price
    if (field === 'asking_price_usd') {
      const price = parseInt(value.replace(/\D/g, ''));
      if (isNaN(price) || price <= 0) {
        await sendMessage(phone, "Please enter a valid price (e.g., 50 or $50)");
        return res.status(200).json({ status: 'invalid price' });
      }
      value = price;
    }

    // Update field
    const listing = conv.context?.listing_data || {};
    listing[field] = value;
    await smsDb.updateContext(phone, {
      listing_data: listing,
      editing_field: null,
      sub_state: null
    });

    console.log(`✅ Updated ${field} = ${value}`);

    await sendMessage(phone, `✓ Updated!\n\nAnything else to edit?`);

    // Show edit menu again
    return await showEditMenu(phone, conv, res);
  }

  const inputLower = input.toLowerCase();

  if (inputLower === 'back' || inputLower === 'cancel') {
    return await showSummary(phone, conv, res);
  }

  // Map number to field
  const fieldMap = {
    '1': 'designer',
    '2': 'pieces_included',
    '3': 'size',
    '4': 'condition',
    '5': 'asking_price_usd',
    '6': 'additional_details'
  };

  const field = fieldMap[inputLower];

  if (!field) {
    await sendMessage(phone, "Reply with a number (1-6) or BACK");
    return res.status(200).json({ status: 'invalid choice' });
  }

  // Save which field they're editing
  await smsDb.updateContext(phone, { editing_field: field });

  const label = FIELD_LABELS[field] || field === 'additional_details' ? 'Notes' : field;
  let prompt = `Enter new ${label}:`;

  if (DROPDOWN_OPTIONS[field]) {
    const options = DROPDOWN_OPTIONS[field].map(opt => opt.label).join(', ');
    prompt += `\n\nOptions: ${options}`;
  }

  await sendMessage(phone, prompt);

  // Set a sub-state to handle the response
  await smsDb.updateContext(phone, { sub_state: 'awaiting_edit_value' });

  return res.status(200).json({ status: 'asked edit value' });
}

async function submitListing(phone, conv, res) {
  const listing = conv.context?.listing_data || {};
  const fileIds = conv.context?.shopify_file_ids || [];

  if (fileIds.length < 3) {
    await sendMessage(phone, `Need at least 3 photos. You have ${fileIds.length}.`);
    await smsDb.setState(phone, 'sell_photos');
    return res.status(200).json({ status: 'need more photos' });
  }

  try {
    // Create Shopify product with media
    const productData = {
      title: `${listing.designer} ${listing.item_type || 'Item'}`,
      description: listing.description || '',
      designer: listing.designer,
      item_type: listing.item_type,
      size: listing.size,
      condition: listing.condition,
      asking_price_usd: listing.asking_price_usd
    };

    const { productId, productUrl } = await shopifyGraphQL.createProductWithMedia(productData, fileIds);

    // Insert into listings table
    const { data: listingRecord, error } = await supabase
      .from('listings')
      .insert({
        conversation_id: conv.id,
        seller_id: conv.seller_id,
        status: 'draft',
        designer: listing.designer,
        item_type: listing.item_type,
        pieces_included: listing.pieces_included,
        size: listing.size,
        condition: listing.condition,
        asking_price_usd: listing.asking_price_usd,
        details: listing.additional_details || null,
        shopify_product_id: productId,
        shopify_product_url: productUrl,
        input_method: 'whatsapp'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Database insert error:', error);
      throw error;
    }

    // Reset conversation
    await smsDb.resetConversation(phone);

    await sendMessage(phone,
      `✅ Success!\n\n` +
      `Your ${listing.designer} listing is now in review.\n\n` +
      `We'll notify you when it's approved.\n\n` +
      `Reply SELL to list another item.`
    );

    return res.status(200).json({ status: 'submitted', listing_id: listingRecord.id });

  } catch (error) {
    console.error('❌ Submit error:', error);
    await sendMessage(phone, "Sorry, submission failed. Please try again or contact support.");
    return res.status(200).json({ status: 'submit failed', error: error.message });
  }
}

// ============ HELPERS ============

function formatListingSummary(listing) {
  const parts = ['Got it! Here\'s what I have:\n'];

  if (listing.designer) parts.push(`✓ Designer: ${listing.designer}`);
  if (listing.item_type) parts.push(`✓ Type: ${listing.item_type}`);
  if (listing.pieces_included) parts.push(`✓ Pieces: ${listing.pieces_included}`);
  if (listing.size) parts.push(`✓ Size: ${listing.size}`);
  if (listing.condition) parts.push(`✓ Condition: ${listing.condition}`);
  if (listing.asking_price_usd) parts.push(`✓ Price: $${listing.asking_price_usd}`);
  if (listing.additional_details) parts.push(`✓ Notes: ${listing.additional_details}`);

  return parts.join('\n');
}

// ============ VOICE TRANSCRIPTION HELPERS ============

async function transcribeAudio(mediaId) {
  const mediaUrl = await getMediaUrl(mediaId);
  const audioBuffer = await downloadMediaBuffer(mediaUrl);
  const base64Audio = audioBuffer.toString('base64');

  const response = await fetch(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: base64Audio })
  });

  const data = await response.json();
  return data.text || '';
}

async function getMediaUrl(mediaId) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${mediaId}`,
    {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    }
  );
  const data = await response.json();
  return data.url;
}

async function downloadMediaBuffer(url) {
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
