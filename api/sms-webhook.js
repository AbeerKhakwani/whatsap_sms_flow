/**
 * WhatsApp Webhook - Conversational Sell Flow
 * State machine with button-first UX, persistent listings, safe field merging
 */

import { createClient } from '@supabase/supabase-js';

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

// Required fields for submission (in order of asking)
const REQUIRED_FIELDS = ['designer', 'item_type', 'size', 'condition', 'pieces_included', 'asking_price_usd'];

// ============ UTILITY FUNCTIONS (A) ============

function normalizeInput(text) {
  if (!text) return '';
  return text
    .replace(/\bNWT\b/ig, 'New with tags')
    .replace(/\bNWOT\b/ig, 'New without tags')
    .replace(/\bEUC\b/ig, 'Gently used')
    .replace(/\$\s*(\d+)/g, '$1')
    .trim();
}

function isNonEmpty(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

function safeMerge(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const key of Object.keys(incoming || {})) {
    const val = incoming[key];
    if (isNonEmpty(val)) merged[key] = val;
  }
  return merged;
}

function getMissingFields(listing) {
  return REQUIRED_FIELDS.filter(f => !isNonEmpty(listing?.[f]));
}

function isListingComplete(listing) {
  return getMissingFields(listing).length === 0;
}

// ============ MAIN HANDLER ============

export default async function handler(req, res) {
  // Webhook verification (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified - v2.0 deployed');
      return res.status(200).send(challenge);
    }
    // Version check endpoint
    if (req.query.version === 'check') {
      return res.status(200).json({ version: '2.0', updated: '2026-01-09 12:15 PM' });
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
    const session = await getSession(phone);

    // Get message content
    let text = '';
    let buttonId = null;

    if (message.type === 'text') {
      text = message.text?.body?.trim() || '';
    } else if (message.type === 'interactive') {
      buttonId = message.interactive?.button_reply?.id;
      text = buttonId || '';
    } else if (message.type === 'audio') {
      try {
        const transcribed = await transcribeAudio(message.audio.id);
        text = normalizeInput(transcribed);
        await sendMessage(phone, `🎤 "${text}"`);
      } catch (e) {
        console.error('Transcribe error:', e);
        await sendMessage(phone, "Couldn't catch that. Try typing instead.");
        return res.status(200).json({ status: 'voice failed' });
      }
    } else if (message.type === 'image') {
      return await handlePhoto(phone, message.image.id, session, res);
    }

    const cmd = text.toLowerCase();
    console.log(`📱 ${phone} [${session.state}]: "${text}" btn=${buttonId}`);

    // ============ GLOBAL COMMANDS ============

    if (cmd === 'cancel') {
      await handleCancel(phone, session);
      return res.status(200).json({ status: 'cancelled' });
    }

    if (cmd === 'info') {
      await sendMessage(phone, `🛍️ Shop: thephirstory.com\n📧 Help: admin@thephirstory.com`);
      return res.status(200).json({ status: 'info' });
    }

    if (cmd === 'hi' || cmd === 'hello' || cmd === 'hey') {
      await sendWelcome(phone);
      return res.status(200).json({ status: 'welcome' });
    }

    if (cmd === 'sell') {
      // ALWAYS reset and ask for email (even if we have it)
      await resetSession(phone);
      const freshSession = await getSession(phone);
      freshSession.state = 'awaiting_email';
      await saveSession(phone, freshSession);
      await sendMessage(phone, "What's your email?");
      console.log(`✅ ${phone} starting fresh - asked for email`);
      return res.status(200).json({ status: 'asked email' });
    }

    // ============ STATE MACHINE ============

    switch (session.state) {
      case 'welcome':
        await sendWelcome(phone);
        return res.status(200).json({ status: 'welcome' });

      case 'awaiting_email':
        return await handleEmail(phone, text, session, res);

      case 'awaiting_description':
        return await handleDescription(phone, text, session, res);

      case 'awaiting_field_value':
        return await handleFieldValue(phone, text, buttonId, session, res);

      case 'awaiting_confirmation':
        return await handleConfirmation(phone, text, buttonId, session, res);

      case 'awaiting_edit_choice':
        return await handleEditChoice(phone, text, buttonId, session, res);

      case 'collecting_photos':
        return await handlePhotoState(phone, text, buttonId, session, res);

      case 'submitted':
        await sendWelcome(phone);
        return res.status(200).json({ status: 'welcome' });

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
  await sendMessage(phone, `Hi! 👋 Welcome to The Phir Story.\n\n• SELL — List an item\n• INFO — Learn more`);
}

async function handleCancel(phone, session) {
  // If there's a draft listing, mark it rejected
  if (session.listing?.listing_id) {
    await supabase
      .from('listings')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', session.listing.listing_id);
  }
  await resetSession(phone);
  await sendMessage(phone, "Cancelled. Reply SELL to start over.");
}

async function handleEmail(phone, text, session, res) {
  const email = text.toLowerCase().trim();

  if (!email.includes('@') || !email.includes('.')) {
    await sendMessage(phone, "Hmm, that doesn't look right.\nTry: you@example.com");
    return res.status(200).json({ status: 'invalid email' });
  }

  // Check seller exists
  const { data: seller } = await supabase
    .from('sellers')
    .select('id, name, phone')
    .ilike('email', email)
    .maybeSingle();

  if (seller?.phone && !phonesMatch(seller.phone, phone)) {
    await sendMessage(phone, "This email is linked to another phone.\nText from that phone or email admin@thephirstory.com");
    return res.status(200).json({ status: 'phone mismatch' });
  }

  // Update seller phone if missing
  if (seller && !seller.phone) {
    await supabase.from('sellers').update({ phone }).eq('id', seller.id);
  }

  session.email = email;
  session.seller_id = seller?.id || null;
  session.seller_name = seller?.name || null;
  session.state = 'awaiting_description';
  await saveSession(phone, session);

  const greeting = seller ? `Welcome back${seller.name ? ', ' + seller.name : ''}!` : "Welcome! Let's list your item.";
  await sendMessage(phone, `${greeting}\n\nDescribe it in one message:\nDesigner, size, condition, price\n\nExample: "Maria B lawn 3pc, M, like new, $80"`);
  return res.status(200).json({ status: 'asked description' });
}

async function handleDescription(phone, text, session, res) {
  const normalized = normalizeInput(text);
  if (!normalized) {
    await sendMessage(phone, "Tell me about your item:\nDesigner, size, condition, price");
    return res.status(200).json({ status: 'no description' });
  }

  try {
    // Extract using AI
    const validation = await callValidateListing(normalized);
    console.log('🤖 AI extracted:', JSON.stringify(validation.extracted));

    // Safe merge into session listing (never overwrites existing values)
    const before = JSON.stringify(session.listing);
    session.listing = safeMerge(session.listing, validation.extracted);
    session.listing.details = normalized; // Store original description
    console.log(`📦 Before: ${before}`);
    console.log(`📦 After merge: ${JSON.stringify(session.listing)}`);
    await saveSession(phone, session);

    // DON'T create listings draft during chat - only on SUBMIT

    // Show what we have NOW (super clear)
    const l = session.listing;
    const parts = [];
    if (l.designer) parts.push(`✓ Designer: ${l.designer}`);
    if (l.item_type) parts.push(`✓ Type: ${l.item_type}`);
    if (l.size) parts.push(`✓ Size: ${l.size}`);
    if (l.condition) parts.push(`✓ Condition: ${l.condition}`);
    if (l.pieces_included) parts.push(`✓ Pieces: ${l.pieces_included}`);
    if (l.asking_price_usd) parts.push(`✓ Price: $${l.asking_price_usd}`);

    const feedback = parts.length > 0
      ? `Got it! Here's what I have:\n\n${parts.join('\n')}`
      : `Got your message. Let me ask you one thing at a time.`;

    await sendMessage(phone, feedback);
    console.log(`📤 Sent feedback: ${feedback}`);

    // Ask for next missing field or confirm
    return await askNextOrConfirm(phone, session, res);

  } catch (error) {
    console.error('❌ AI extraction error:', error);
    // DON'T reset - just ask them to try again
    await sendMessage(phone, "Couldn't understand that. Try again:\nExample: \"Maria B lawn 3pc, M, like new, $80\"");
    return res.status(200).json({ status: 'extraction error' });
  }
}

async function handleFieldValue(phone, text, buttonId, session, res) {
  const field = session.current_field;
  let value = buttonId || normalizeInput(text);

  // Handle "Type" button - ask them to type
  if (value === 'type' || value === 'Type' || value === 'Type my own') {
    await sendMessage(phone, getTypePrompt(field));
    return res.status(200).json({ status: 'asked to type' });
  }

  // Map button values to field values
  value = mapButtonToValue(field, value);

  if (!isNonEmpty(value)) {
    await sendMessage(phone, "Didn't catch that. Try again?");
    return res.status(200).json({ status: 'no value' });
  }

  // Safe merge
  session.listing = safeMerge(session.listing, { [field]: value });
  session.current_field = null;
  console.log(`📦 Added ${field}=${value}, listing now:`, JSON.stringify(session.listing));
  await saveSession(phone, session);

  // DON'T create listings draft during chat - only on SUBMIT

  // Show ALL fields we have so far (super clear)
  const l = session.listing;
  const parts = [];
  if (l.designer) parts.push(`✓ Designer: ${l.designer}`);
  if (l.item_type) parts.push(`✓ Type: ${l.item_type}`);
  if (l.size) parts.push(`✓ Size: ${l.size}`);
  if (l.condition) parts.push(`✓ Condition: ${l.condition}`);
  if (l.pieces_included) parts.push(`✓ Pieces: ${l.pieces_included}`);
  if (l.asking_price_usd) parts.push(`✓ Price: $${l.asking_price_usd}`);

  const summary = `Got it! Here's what I have:\n\n${parts.join('\n')}`;
  await sendMessage(phone, summary);
  console.log(`📤 Sent summary: ${summary}`);

  return await askNextOrConfirm(phone, session, res);
}

async function handleConfirmation(phone, text, buttonId, session, res) {
  const response = (buttonId || text).toLowerCase();

  if (response === 'yes' || response === 'yes ✓') {
    session.state = 'collecting_photos';
    session.photos = session.photos || [];
    // Include early photos
    if (session.early_photos?.length) {
      session.photos = [...session.photos, ...session.early_photos];
      session.early_photos = [];
    }
    await saveSession(phone, session);

    const count = session.photos.length;
    if (count >= 3) {
      await sendMessage(phone, `Got ${count} photos ✓`);
      await sendButtons(phone, "Ready to submit?", [
        { id: 'submit', title: 'SUBMIT ✓' },
        { id: 'add_more', title: 'Add more' }
      ]);
    } else {
      await sendMessage(phone, `Great — send 3+ photos:\n📸 Front • Back • Brand tag`);
    }
    return res.status(200).json({ status: 'collecting photos' });
  }

  if (response === 'update') {
    session.state = 'awaiting_edit_choice';
    await saveSession(phone, session);
    await sendButtons(phone, "What to change?", [
      { id: 'edit_designer', title: 'Designer' },
      { id: 'edit_item_type', title: 'Item type' },
      { id: 'edit_size', title: 'Size' }
    ]);
    // Send second row
    await sendButtons(phone, "Or:", [
      { id: 'edit_condition', title: 'Condition' },
      { id: 'edit_pieces', title: 'Pieces' },
      { id: 'edit_price', title: 'Price' }
    ]);
    return res.status(200).json({ status: 'asked edit choice' });
  }

  return res.status(200).json({ status: 'unknown' });
}

async function handleEditChoice(phone, text, buttonId, session, res) {
  const choice = (buttonId || text).toLowerCase();

  const fieldMap = {
    'edit_designer': 'designer',
    'designer': 'designer',
    'edit_item_type': 'item_type',
    'item type': 'item_type',
    'edit_size': 'size',
    'size': 'size',
    'edit_condition': 'condition',
    'condition': 'condition',
    'edit_pieces': 'pieces_included',
    'pieces': 'pieces_included',
    'edit_price': 'asking_price_usd',
    'price': 'asking_price_usd'
  };

  const field = fieldMap[choice];
  if (!field) {
    await sendButtons(phone, "Pick one:", [
      { id: 'edit_designer', title: 'Designer' },
      { id: 'edit_size', title: 'Size' },
      { id: 'edit_price', title: 'Price' }
    ]);
    return res.status(200).json({ status: 'asked again' });
  }

  session.current_field = field;
  session.state = 'awaiting_field_value';
  await saveSession(phone, session);

  await askForField(phone, field);
  return res.status(200).json({ status: `editing ${field}` });
}

async function handlePhotoState(phone, text, buttonId, session, res) {
  const cmd = (buttonId || text).toLowerCase();

  if (cmd === 'submit' || cmd === 'submit ✓') {
    return await submitListing(phone, session, res);
  }

  if (cmd === 'add_more' || cmd === 'add more') {
    await sendMessage(phone, "Send more photos. Tap SUBMIT when ready.");
    return res.status(200).json({ status: 'adding more' });
  }

  await sendMessage(phone, "Send photos or tap SUBMIT when ready.");
  return res.status(200).json({ status: 'waiting photos' });
}

async function handlePhoto(phone, mediaId, session, res) {
  const imageData = await downloadMedia(mediaId);

  if (session.state !== 'collecting_photos') {
    session.early_photos = session.early_photos || [];
    session.early_photos.push(imageData);
    await saveSession(phone, session);

    if (session.state === 'welcome') {
      await sendMessage(phone, "Got the photo! 📸\nReply SELL to list your item.");
    } else {
      await sendMessage(phone, "Got it! 📸 I'll add it to your listing.");
    }
    return res.status(200).json({ status: 'early photo' });
  }

  session.photos = session.photos || [];
  session.photos.push(imageData);
  await saveSession(phone, session);

  const count = session.photos.length;

  if (count < 3) {
    const remaining = 3 - count;
    await sendMessage(phone, `${count} photo${count > 1 ? 's' : ''} ✓ — send ${remaining} more`);
  } else {
    await sendMessage(phone, `${count} photos ✓`);
    await sendButtons(phone, "Ready to submit?", [
      { id: 'submit', title: 'SUBMIT ✓' },
      { id: 'add_more', title: 'Add more' }
    ]);
  }

  return res.status(200).json({ status: 'photo received', count });
}

// ============ FLOW HELPERS ============

async function askNextOrConfirm(phone, session, res) {
  const missing = getMissingFields(session.listing);
  console.log(`🔍 Missing fields: ${JSON.stringify(missing)}`);

  if (missing.length === 0) {
    // All fields complete - show confirmation
    session.state = 'awaiting_confirmation';
    await saveSession(phone, session);

    const l = session.listing;
    const summary = `Perfect! Here's your listing:\n\n` +
      `✓ Designer: ${l.designer}\n` +
      `✓ Type: ${l.item_type}\n` +
      `✓ Size: ${l.size}\n` +
      `✓ Condition: ${l.condition}\n` +
      `✓ Pieces: ${l.pieces_included}\n` +
      `✓ Price: $${l.asking_price_usd}`;

    await sendMessage(phone, summary);
    await sendButtons(phone, "Ready for photos?", [
      { id: 'yes', title: 'YES ✓' },
      { id: 'update', title: 'UPDATE' }
    ]);
    console.log('📤 Sent confirmation with buttons');
    return res.status(200).json({ status: 'confirmation' });
  }

  // Ask for next missing field (one at a time with buttons)
  const nextField = missing[0];
  session.current_field = nextField;
  session.state = 'awaiting_field_value';
  await saveSession(phone, session);

  console.log(`❓ Asking for: ${nextField}`);
  await askForField(phone, nextField);
  return res.status(200).json({ status: `asked ${nextField}` });
}

async function askForField(phone, field) {
  const questions = {
    designer: {
      text: "What's the designer/brand?",
      buttons: null // Free text
    },
    item_type: {
      text: "What type of item?",
      buttons: [
        { id: 'Lawn Suit', title: 'Lawn Suit' },
        { id: 'Formal', title: 'Formal' },
        { id: 'Type', title: 'Type' }
      ]
    },
    size: {
      text: "What size?",
      buttons: [
        { id: 'S', title: 'S' },
        { id: 'M', title: 'M' },
        { id: 'L', title: 'L' }
      ]
    },
    condition: {
      text: "Condition?",
      buttons: [
        { id: 'New with tags', title: 'New with tags' },
        { id: 'Like new', title: 'Like new' },
        { id: 'Gently used', title: 'Gently used' }
      ]
    },
    pieces_included: {
      text: "What's included?",
      buttons: [
        { id: 'Kurta only', title: 'Kurta only' },
        { id: '2-piece', title: '2-piece' },
        { id: '3-piece', title: '3-piece' }
      ]
    },
    asking_price_usd: {
      text: "Asking price (USD)?",
      buttons: [
        { id: '50', title: '$50' },
        { id: '80', title: '$80' },
        { id: 'Type my own', title: 'Type my own' }
      ]
    }
  };

  const q = questions[field] || { text: `What's the ${field}?`, buttons: null };

  if (q.buttons) {
    await sendButtons(phone, q.text, q.buttons);
  } else {
    await sendMessage(phone, q.text);
  }
}

function getTypePrompt(field) {
  const prompts = {
    size: "Type your size (e.g., XL, US 10, Chest 42):",
    asking_price_usd: "Type your price in USD (just the number):",
    item_type: "Type the item type (e.g., Kurta, Lehnga, Sharara):"
  };
  return prompts[field] || `Type the ${field}:`;
}

function mapButtonToValue(field, value) {
  // Remove $ from price buttons
  if (field === 'asking_price_usd') {
    return value.replace(/[$,]/g, '').trim();
  }
  return value;
}

function formatFieldValue(field, value) {
  if (field === 'asking_price_usd') return `$${value}`;
  return value;
}

// (Removed createOrUpdateListingsDraft - we only create listings on SUBMIT now)

async function submitListing(phone, session, res) {
  const listing = session.listing;

  try {
    // Call create-draft API for Shopify
    const draftRes = await fetch(`${API_BASE}/api/create-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: session.email,
        phone: phone,
        description: listing.details || '',
        extracted: {
          designer: listing.designer,
          item_type: listing.item_type,
          size: listing.size,
          condition: listing.condition,
          asking_price: listing.asking_price_usd
        }
      })
    });

    const draftData = await draftRes.json();
    console.log('📦 Draft created:', draftData);

    if (!draftData.success || !draftData.productId) {
      throw new Error(draftData.error || 'Failed to create draft');
    }

    // Upload photos
    if (session.photos?.length > 0) {
      for (let i = 0; i < session.photos.length; i++) {
        const photo = session.photos[i];
        try {
          await fetch(`${API_BASE}/api/product-image?action=add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: draftData.productId,
              base64: photo.base64,
              filename: `photo_${i + 1}.jpg`
            })
          });
        } catch (e) {
          console.error(`Photo ${i + 1} failed:`, e);
        }
      }
    }

    // CREATE listings row on submit (not during chat)
    const { data: createdListing } = await supabase
      .from('listings')
      .insert({
        seller_id: session.seller_id,
        conversation_id: null,
        status: 'pending_approval',
        input_method: 'whatsapp',
        shopify_product_id: draftData.productId,
        designer: listing.designer,
        item_type: listing.item_type,
        size: listing.size,
        condition: listing.condition,
        pieces_included: listing.pieces_included,
        asking_price_usd: parseFloat(listing.asking_price_usd) || null,
        details: listing.details,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    console.log('✅ Listing created in DB:', createdListing?.id);

    // Reset session
    session.state = 'submitted';
    await saveSession(phone, session);
    await resetSession(phone);

    await sendMessage(phone,
      `🎉 Submitted!\n\n` +
      `📦 ${listing.designer} ${listing.item_type || ''}\n` +
      `📏 ${listing.size} • $${listing.asking_price_usd}\n\n` +
      `We'll notify you when it's live.\nReply SELL to list another.`
    );

    return res.status(200).json({ status: 'submitted', productId: draftData.productId });

  } catch (error) {
    console.error('❌ Submit error:', error);
    // DON'T reset session - keep their data so they can try again
    await sendMessage(phone, "Oops, something went wrong submitting your listing.\n\nYour info is saved. Reply SUBMIT to try again, or CANCEL to start over.");
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

// ============ EXTERNAL APIs ============

async function callValidateListing(description) {
  try {
    const response = await fetch(`${API_BASE}/api/validate-listing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    return await response.json();
  } catch (e) {
    console.error('Validate error:', e);
    return { extracted: {}, missing: REQUIRED_FIELDS, isComplete: false };
  }
}

async function transcribeAudio(mediaId) {
  const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const mediaInfo = await mediaRes.json();

  const audioRes = await fetch(mediaInfo.url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const audioBuffer = await audioRes.arrayBuffer();
  const base64 = Buffer.from(audioBuffer).toString('base64');

  const transcribeRes = await fetch(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: base64 })
  });

  const data = await transcribeRes.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

async function downloadMedia(mediaId) {
  const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const mediaInfo = await mediaRes.json();

  const imageRes = await fetch(mediaInfo.url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const imageBuffer = await imageRes.arrayBuffer();

  return {
    base64: Buffer.from(imageBuffer).toString('base64'),
    mimeType: mediaInfo.mime_type || 'image/jpeg'
  };
}

function phonesMatch(phone1, phone2) {
  const d1 = phone1?.replace(/\D/g, '').slice(-10);
  const d2 = phone2?.replace(/\D/g, '').slice(-10);
  return d1 === d2;
}

// ============ SESSION MANAGEMENT ============

async function getSession(phone) {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (data) {
    // Read seller_id from listing JSON (stored as _seller_id) since whatsapp_sessions doesn't have those columns
    const listing = data.listing || {};
    return {
      state: data.state || 'welcome',
      email: data.email,
      seller_id: listing._seller_id || null,
      seller_name: listing._seller_name || null,
      listing: listing,
      photos: data.photos || [],
      early_photos: data.early_photos || [],
      current_field: data.current_field
    };
  }

  return { state: 'welcome', listing: {}, photos: [], early_photos: [] };
}

async function saveSession(phone, session) {
  // Store seller_id in listing json since whatsapp_sessions doesn't have that column
  const listingWithMeta = {
    ...session.listing,
    _seller_id: session.seller_id,
    _seller_name: session.seller_name
  };

  await supabase
    .from('whatsapp_sessions')
    .upsert({
      phone,
      state: session.state,
      email: session.email || null,
      listing: listingWithMeta,
      photos: session.photos || [],
      early_photos: session.early_photos || [],
      current_field: session.current_field || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone' });
}

async function resetSession(phone) {
  await supabase
    .from('whatsapp_sessions')
    .upsert({
      phone,
      state: 'welcome',
      email: null,
      listing: {},
      photos: [],
      early_photos: [],
      current_field: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone' });
}

// ============ WHATSAPP API ============

async function sendMessage(phone, text) {
  await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
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
}

async function sendButtons(phone, text, buttons) {
  await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
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
          buttons: buttons.slice(0, 3).map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    })
  });
}
