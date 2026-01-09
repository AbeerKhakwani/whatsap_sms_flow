/**
 * WhatsApp Webhook - Clean MVP for Sunday Demo
 * Flow: SELL → email auth → description → missing fields → photos → submit
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

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

// Dropdown options with keywords for smart matching (from SellerSubmit.jsx)
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

function safeMerge(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const key of Object.keys(incoming || {})) {
    const val = incoming[key];
    if (isNonEmpty(val) && !isNonEmpty(merged[key])) {
      merged[key] = val;
    }
  }
  return merged;
}

function getMissingFields(listing) {
  return REQUIRED_FIELDS.filter(f => !isNonEmpty(listing?.[f]));
}

function phonesMatch(p1, p2) {
  const clean1 = p1.replace(/\D/g, '').slice(-10);
  const clean2 = p2.replace(/\D/g, '').slice(-10);
  return clean1 === clean2;
}

/**
 * Compress and resize image buffer to optimized JPEG base64
 * Reduces file size significantly before uploading to Shopify
 */
async function bufferToOptimizedJpegBase64(buffer) {
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
    return out.toString('base64');
  } catch (error) {
    console.error('❌ Image compression error:', error);
    // Fallback to uncompressed if sharp fails
    return buffer.toString('base64');
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
      console.log('✅ Webhook verified - MVP v3.0');
      return res.status(200).send(challenge);
    }
    if (req.query.version === 'check') {
      return res.status(200).json({ version: '3.0', updated: '2026-01-09 MVP' });
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
    const session = await getSession(phone);

    // Idempotency: Skip if we've already processed this message
    if (session.processedMessages?.includes(messageId)) {
      console.log(`⏭️  Skipping duplicate message ${messageId}`);
      return res.status(200).json({ status: 'duplicate' });
    }

    // Mark as processed and save immediately to prevent race conditions
    session.processedMessages = session.processedMessages || [];
    session.processedMessages.push(messageId);
    // Keep only last 20 message IDs to prevent unbounded growth
    if (session.processedMessages.length > 20) {
      session.processedMessages = session.processedMessages.slice(-20);
    }
    await saveSession(phone, session);

    // Parse message
    let text = '';
    let buttonId = null;

    if (message.type === 'text') {
      text = message.text?.body?.trim() || '';
    } else if (message.type === 'interactive') {
      // Handle both button replies and list replies
      buttonId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
      text = buttonId || '';
    } else if (message.type === 'audio') {
      // Transcribe voice
      try {
        text = await transcribeAudio(message.audio.id);
        await sendMessage(phone, `🎤 I heard: "${text}"`);
      } catch (e) {
        console.error('Transcription error:', e);
        await sendMessage(phone, "Couldn't transcribe. Please type instead.");
        return res.status(200).json({ status: 'transcription failed' });
      }
    } else if (message.type === 'image') {
      return await handlePhoto(phone, message.image.id, session, res);
    }

    const cmd = text.toLowerCase();
    console.log(`📱 ${phone} [${session.state}]: "${text}"`);

    // Global commands
    if (cmd === 'cancel') {
      await resetSession(phone);
      await sendMessage(phone, "Cancelled. Reply SELL to start over.");
      return res.status(200).json({ status: 'cancelled' });
    }

    if (cmd === 'submit') {
      const photoCount = (session.photos || []).length;
      const missing = getMissingFields(session.listing);

      // Ready to submit: has all fields + 3+ photos (regardless of state)
      if (photoCount >= 3 && missing.length === 0) {
        return await submitListing(phone, session, res);
      }

      // Has fields but needs more photos
      if (photoCount < 3 && missing.length === 0) {
        await sendMessage(phone, `You can submit after 3 photos. Need ${3 - photoCount} more 📸`);
        return res.status(200).json({ status: 'need more photos' });
      }

      // Missing required fields - resume automatically
      session.state = 'awaiting_missing_field';
      await saveSession(phone, session);
      return await askNextMissingField(phone, session, res);
    }

    if (cmd === 'sell') {
      // Check if they're mid-flow
      const hasProgress = session.email || session.listing?.designer || session.photos?.length > 0;
      const isNotWelcome = session.state !== 'welcome';

      if (hasProgress && isNotWelcome) {
        // Mid-flow - offer resume or restart
        console.log(`⏸️  ${phone} mid-flow (state: ${session.state}) - offering resume/restart`);
        // Store previous state before overwriting
        session.prev_state = session.state;
        session.state = 'awaiting_resume_choice';
        await saveSession(phone, session);

        await sendButtons(phone, "You're already listing an item. Continue where you left off?", [
          { id: 'resume', title: 'CONTINUE' },
          { id: 'restart', title: 'RESTART' }
        ]);
        return res.status(200).json({ status: 'offered resume' });
      }

      // Check if they have a valid recent session (within 7 days)
      const hasValidEmail = session.email && session.email.includes('@');
      const hasSeller = session.listing?._seller_id;
      const sessionAge = session.created_at ? Date.now() - new Date(session.created_at).getTime() : Infinity;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      if (hasValidEmail && hasSeller && sessionAge < sevenDays) {
        // Session is still valid - go straight to description
        console.log(`✅ ${phone} has valid session (${Math.round(sessionAge / (24 * 60 * 60 * 1000))} days old) - skip email`);
        session.state = 'awaiting_description';
        // Preserve _meta when resetting listing
        const meta = session.listing?._meta;
        session.listing = { _seller_id: session.listing._seller_id, _meta: meta };
        session.photos = [];
        session.shopify_product_id = null; // Clear any old draft ID
        await saveSession(phone, session);

        await sendMessage(phone, `Welcome back! ✓\n\nDescribe your item (voice or text):\nDesigner, size, condition, price\n\nExample: "Maria B lawn 3pc, M, like new, $80"`);
        return res.status(200).json({ status: 'returning user - asked description' });
      } else {
        // Session expired or invalid - reset and ask for email
        console.log(`✅ ${phone} session expired or invalid - asking for email`);
        await resetSession(phone);
        const freshSession = await getSession(phone);
        freshSession.state = 'awaiting_email';
        freshSession.created_at = new Date().toISOString();
        await saveSession(phone, freshSession);
        await sendMessage(phone, "What's your email?");
        return res.status(200).json({ status: 'asked email' });
      }
    }

    // State machine
    switch (session.state) {
      case 'welcome':
        await sendWelcome(phone);
        return res.status(200).json({ status: 'welcome' });

      case 'awaiting_resume_choice':
        return await handleResumeChoice(phone, text, buttonId, session, res);

      case 'awaiting_email':
        return await handleEmail(phone, text, session, res);

      case 'awaiting_account_confirmation':
        return await handleAccountConfirmation(phone, text, buttonId, session, res);

      case 'awaiting_description':
        return await handleDescription(phone, text, session, res);

      case 'awaiting_missing_field':
        return await handleMissingField(phone, text, buttonId, session, res);

      case 'awaiting_additional_details':
        return await handleAdditionalDetails(phone, text, buttonId, session, res);

      case 'awaiting_additional_details_text':
        return await handleAdditionalDetailsText(phone, text, session, res);

      case 'collecting_photos':
        return await handlePhotoState(phone, text, buttonId, session, res);

      case 'ready_to_submit':
        // Handle final submit confirmation
        const submitResponse = (buttonId || text).toLowerCase();
        if (submitResponse === 'submit' || submitResponse === 'yes') {
          return await submitListing(phone, session, res);
        } else if (submitResponse === 'cancel') {
          await resetSession(phone);
          await sendMessage(phone, "Listing cancelled. Reply SELL to start over.");
          return res.status(200).json({ status: 'cancelled' });
        } else {
          // Show summary again
          const listing = session.listing;
          const photoCount = (session.photos || []).filter(p => p.imageUrl).length;

          const summary =
            `📋 *Ready to submit!*\n\n` +
            `📦 ${listing.designer} ${listing.item_type || ''}\n` +
            `📏 Size: ${listing.size}\n` +
            `✨ Condition: ${listing.condition}\n` +
            `💰 Price: $${listing.asking_price_usd}\n` +
            `📸 Photos: ${photoCount}\n\n` +
            `Click SUBMIT to confirm`;

          await sendButtons(phone, summary, [
            { id: 'submit', title: 'YES, SUBMIT ✓' },
            { id: 'cancel', title: 'CANCEL' }
          ]);

          return res.status(200).json({ status: 'waiting for submit' });
        }

      case 'submitted':
        // Reset session for new listing
        await resetSession(phone);
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
  await sendMessage(phone, `Hi! 👋 Welcome to The Phir Story.\n\n• Reply SELL to list an item\n• Visit thephirstory.com to shop`);
}

async function handleEmail(phone, text, session, res) {
  const email = text.toLowerCase().trim();

  // Validate email format
  if (!email.includes('@') || !email.includes('.')) {
    await sendMessage(phone, "Hmm, that doesn't look right.\nTry: you@example.com");
    return res.status(200).json({ status: 'invalid email' });
  }

  // Check if seller exists
  const { data: seller } = await supabase
    .from('sellers')
    .select('id, name, phone')
    .ilike('email', email)
    .maybeSingle();

  if (seller) {
    // Existing seller - check phone match
    if (seller.phone && !phonesMatch(seller.phone, phone)) {
      await sendMessage(phone, "This email is linked to another phone.\nText from that phone or email admin@thephirstory.com");
      return res.status(200).json({ status: 'phone mismatch' });
    }

    // Update phone if missing
    if (!seller.phone) {
      await supabase.from('sellers').update({ phone }).eq('id', seller.id);
    }

    // Welcome back - COMPLETE RESET for new listing
    console.log(`✅ Existing seller: ${seller.id}, resetting session for new listing`);

    session.email = email;
    session.listing = { _seller_id: seller.id, _seller_name: seller.name };  // Start fresh, no old data
    session.photos = [];  // Clear old photos
    session.shopify_product_id = null;  // Clear old draft
    session.state = 'awaiting_description';
    session.current_field = null;
    session.prev_state = null;
    session.created_at = new Date().toISOString();  // New timestamp
    await saveSession(phone, session);

    console.log(`📝 Session reset - state: awaiting_description, listing fields: ${Object.keys(session.listing).length}`);

    const greeting = `Welcome back${seller.name ? ', ' + seller.name : ''}! ✓`;
    await sendMessage(phone, `${greeting}\n\nDescribe your item (voice or text):\nDesigner, size, condition, price\n\nExample: "Maria B lawn 3pc, M, like new, $80"`);
    return res.status(200).json({ status: 'asked description' });
  } else {
    // New seller - confirm account creation
    session.email = email;
    session.state = 'awaiting_account_confirmation';
    session.created_at = session.created_at || new Date().toISOString();
    await saveSession(phone, session);

    await sendMessage(phone, `New here? Let's create your account!`);
    await sendButtons(phone, `Create account for ${email} and start selling?`, [
      { id: 'create_yes', title: 'YES ✓' },
      { id: 'create_no', title: 'CANCEL' }
    ]);
    return res.status(200).json({ status: 'asked confirmation' });
  }
}

async function handleAccountConfirmation(phone, text, buttonId, session, res) {
  const response = (buttonId || text).toLowerCase();

  if (response === 'create_yes' || response === 'yes') {
    // Create new seller
    const { data: newSeller } = await supabase
      .from('sellers')
      .insert({ email: session.email, phone })
      .select('id')
      .single();

    console.log(`✅ New seller created: ${newSeller.id}, resetting session for first listing`);

    // COMPLETE RESET for new listing
    session.listing = { _seller_id: newSeller.id };  // Start fresh, no old data
    session.photos = [];  // Clear old photos
    session.shopify_product_id = null;  // No draft yet
    session.state = 'awaiting_description';
    session.current_field = null;
    session.prev_state = null;
    session.created_at = new Date().toISOString();  // New timestamp
    await saveSession(phone, session);

    console.log(`📝 Session reset - state: awaiting_description, listing fields: ${Object.keys(session.listing).length}`);

    await sendMessage(phone, `Account created! ✓\n\nDescribe your item (voice or text):\nDesigner, size, condition, price\n\nExample: "Maria B lawn 3pc, M, like new, $80"`);
    return res.status(200).json({ status: 'asked description' });
  } else {
    await resetSession(phone);
    await sendMessage(phone, "Cancelled. Reply SELL when ready.");
    return res.status(200).json({ status: 'cancelled' });
  }
}

async function handleResumeChoice(phone, text, buttonId, session, res) {
  const response = (buttonId || text).toLowerCase();

  if (response === 'resume' || response === 'continue') {
    // Resume where they left off using prev_state
    const prevState = session.prev_state || 'awaiting_description';
    console.log(`▶️  Resuming from prev_state: ${prevState}`);

    // Determine where to resume based on previous state and data
    if (prevState === 'collecting_photos' || session.photos?.length > 0) {
      const photoCount = (session.photos || []).filter(p => p.imageUrl).length;
      session.state = 'collecting_photos';
      session.prev_state = null; // Clear prev_state
      await saveSession(phone, session);

      // Just remind them to send photos - don't nag about count
      await sendMessage(phone, `You have ${photoCount} photo(s).\n\nSend more or continue to submit! 📸`);
      return res.status(200).json({ status: 'resumed photos' });
    } else {
      // Resume asking for missing fields
      session.state = 'awaiting_missing_field';
      session.prev_state = null; // Clear prev_state
      await saveSession(phone, session);
      return await askNextMissingField(phone, session, res);
    }
  } else {
    // Restart fresh
    console.log(`🔄 Restarting fresh`);
    await resetSession(phone);
    const freshSession = await getSession(phone);
    freshSession.state = 'awaiting_email';
    freshSession.created_at = new Date().toISOString();
    await saveSession(phone, freshSession);
    await sendMessage(phone, "What's your email?");
    return res.status(200).json({ status: 'restarted' });
  }
}

async function handleDescription(phone, text, session, res) {
  const normalized = normalizeInput(text);
  if (!normalized) {
    await sendMessage(phone, "Tell me about your item:\nDesigner, size, condition, price");
    return res.status(200).json({ status: 'no description' });
  }

  try {
    // AI extraction (silent)
    const validation = await callValidateListing(normalized);
    console.log('🤖 Extracted:', JSON.stringify(validation.extracted));

    // Smart match dropdowns
    const extracted = validation.extracted || {};

    // Extract embellishment/detail keywords from description
    const embellishmentKeywords = ['beadwork', 'beaded', 'embroidery', 'embroidered', 'sequin', 'sequins',
                                   'stone', 'stones', 'mirror', 'mirrors', 'lace', 'pearl', 'pearls',
                                   'threadwork', 'handwork', 'zari', 'gota', 'tilla'];
    const foundEmbellishments = embellishmentKeywords.filter(keyword =>
      normalized.toLowerCase().includes(keyword)
    );

    const matched = {
      designer: extracted.designer || '',
      item_type: extracted.item_type || extracted.pieces || '',
      pieces_included: matchToDropdown(extracted.pieces || extracted.item_type || text, 'pieces_included'),
      size: matchToDropdown(extracted.size, 'size'),
      condition: matchToDropdown(extracted.condition, 'condition'),
      asking_price_usd: extracted.asking_price || extracted.asking_price_usd || '',
      color: extracted.color || '',
      material: extracted.material || '',
      additional_details: foundEmbellishments.length > 0 ? foundEmbellishments.join(', ') : '',
      details: normalized
    };

    // Safe merge
    session.listing = safeMerge(session.listing, matched);
    console.log('📦 After merge:', JSON.stringify(session.listing));
    await saveSession(phone, session);

    // Show what we got
    const summary = formatListingSummary(session.listing);
    await sendMessage(phone, summary);

    // Ask for missing fields
    return await askNextMissingField(phone, session, res);

  } catch (error) {
    console.error('❌ AI extraction error:', error);
    await sendMessage(phone, "Couldn't understand that. Try again:\nExample: 'Maria B lawn 3pc, M, like new, $80'");
    return res.status(200).json({ status: 'extraction error' });
  }
}

async function handleMissingField(phone, text, buttonId, session, res) {
  const currentField = session.current_field;
  if (!currentField) {
    return await askNextMissingField(phone, session, res);
  }

  let value = buttonId || text.trim();

  // Handle price validation
  if (currentField === 'asking_price_usd') {
    const priceMatch = value.match(/(\d+)/);
    if (!priceMatch) {
      await sendMessage(phone, "Please enter a number for the price.\ne.g., 80");
      return res.status(200).json({ status: 'invalid price' });
    }
    value = priceMatch[1];
  }

  // Smart match for dropdowns
  if (['pieces_included', 'size', 'condition'].includes(currentField)) {
    const matched = matchToDropdown(value, currentField);
    if (matched) value = matched;
  }

  // Check if "Measurements" - need details
  if (value === 'Measurements' && currentField === 'size') {
    session.current_field = 'size_measurements';
    await saveSession(phone, session);
    await sendMessage(phone, "Enter measurements here:\n(e.g., Bust 36\", Waist 28\", Length 42\")");
    return res.status(200).json({ status: 'asked measurements' });
  }

  // Handle size measurements details response
  if (currentField === 'size_measurements') {
    session.listing.size = `Measurements: ${value}`;
    session.current_field = null;
  } else {
    // Normal field
    session.listing[currentField] = value;
    session.current_field = null;
  }

  console.log(`📦 Added ${currentField}=${value}`);
  await saveSession(phone, session);

  // Show updated summary
  const summary = formatListingSummary(session.listing);
  await sendMessage(phone, summary);

  // Ask next or move to photos
  return await askNextMissingField(phone, session, res);
}

/**
 * Create Shopify draft product for this session
 * Called BEFORE asking for photos (so we have a productId to upload to)
 */
async function createDraftForSession(phone, session) {
  // Skip if draft already exists
  if (session.shopify_product_id) {
    console.log(`✅ Draft already exists: ${session.shopify_product_id}`);
    return true;
  }

  const listing = session.listing;

  // Validate price
  let askingPrice = listing.asking_price_usd;
  if (typeof askingPrice === 'string') {
    const priceMatch = askingPrice.match(/(\d+)/);
    if (priceMatch) {
      askingPrice = parseFloat(priceMatch[1]);
    } else {
      askingPrice = null;
    }
  }

  if (!askingPrice || askingPrice <= 0) {
    console.error('❌ Invalid price:', listing.asking_price_usd);
    return false;
  }

  try {
    console.log(`📦 Creating Shopify draft BEFORE photos... (phone: ${phone})`);

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
          pieces: listing.pieces_included,
          size: listing.size,
          condition: listing.condition,
          color: listing.color,
          material: listing.material,
          asking_price: askingPrice
        },
        source: 'whatsapp'  // Track WhatsApp-created drafts
      })
    });

    const draftData = await draftRes.json();

    if (!draftData.success || !draftData.productId) {
      console.error('❌ Draft creation failed:', draftData.error);
      return false;
    }

    // Save product ID to session
    session.shopify_product_id = draftData.productId;
    await saveSession(phone, session);

    console.log(`✅ Created draft: ${draftData.productId}`);
    return true;

  } catch (error) {
    console.error('❌ Error creating draft:', error.message);
    return false;
  }
}

async function handleAdditionalDetails(phone, text, buttonId, session, res) {
  const response = (buttonId || text).toLowerCase();

  if (response === 'skip_details' || response === 'no' || response === 'skip') {
    // Skip additional details - show summary and ask for final confirmation
    console.log('📝 Skipping additional details - showing summary');

    session.state = 'ready_to_submit';
    await saveSession(phone, session);

    // Re-fetch session to ensure we have latest photos
    const freshSession = await getSession(phone);
    const listing = freshSession.listing;
    const photoCount = (freshSession.photos || []).filter(p => p.imageUrl).length;

    console.log(`📊 Summary - Total photos in session: ${freshSession.photos?.length || 0}, with URLs: ${photoCount}`);
    if (freshSession.photos?.length > 0) {
      console.log(`📸 First photo check:`, freshSession.photos[0]);
    }

    const summary =
      `📋 *Ready to submit!*\n\n` +
      `📦 ${listing.designer} ${listing.item_type || ''}\n` +
      `📏 Size: ${listing.size}\n` +
      `✨ Condition: ${listing.condition}\n` +
      `💰 Price: $${listing.asking_price_usd}\n` +
      `📸 Photos: ${photoCount}\n\n` +
      `Look good?`;

    await sendButtons(phone, summary, [
      { id: 'submit', title: 'YES, SUBMIT ✓' },
      { id: 'cancel', title: 'CANCEL' }
    ]);

    return res.status(200).json({ status: 'ready to submit' });
  }

  if (response === 'add_details' || response === 'yes') {
    // Ask them to type details
    await sendMessage(phone, `Great! Tell me about any flaws or special details:\n\n(e.g., "slight stain on sleeve", "missing belt", "beautiful beadwork")`);
    session.state = 'awaiting_additional_details_text';
    await saveSession(phone, session);
    return res.status(200).json({ status: 'waiting for details text' });
  }

  // They typed details directly
  if (text && text.trim().length > 0) {
    const existingDetails = session.listing.additional_details || '';
    const newDetails = existingDetails ? `${existingDetails}. ${text.trim()}` : text.trim();

    session.listing.additional_details = newDetails;
    console.log(`📝 Added additional details: ${newDetails}`);

    session.state = 'ready_to_submit';
    await saveSession(phone, session);

    // Show summary
    const listing = session.listing;
    const photoCount = (session.photos || []).filter(p => p.imageUrl).length;

    const summary =
      `📋 *Ready to submit!*\n\n` +
      `📦 ${listing.designer} ${listing.item_type || ''}\n` +
      `📏 Size: ${listing.size}\n` +
      `✨ Condition: ${listing.condition}\n` +
      `💰 Price: $${listing.asking_price_usd}\n` +
      `📸 Photos: ${photoCount}\n` +
      `📝 Notes: ${newDetails.substring(0, 50)}${newDetails.length > 50 ? '...' : ''}\n\n` +
      `Look good?`;

    await sendButtons(phone, summary, [
      { id: 'submit', title: 'YES, SUBMIT ✓' },
      { id: 'cancel', title: 'CANCEL' }
    ]);

    return res.status(200).json({ status: 'ready to submit' });
  }

  // Fallback - show summary
  session.state = 'ready_to_submit';
  await saveSession(phone, session);

  const listing = session.listing;
  const photoCount = (session.photos || []).filter(p => p.imageUrl).length;

  const summary =
    `📋 *Ready to submit!*\n\n` +
    `📦 ${listing.designer} ${listing.item_type || ''}\n` +
    `📏 Size: ${listing.size}\n` +
    `✨ Condition: ${listing.condition}\n` +
    `💰 Price: $${listing.asking_price_usd}\n` +
    `📸 Photos: ${photoCount}\n\n` +
    `Look good?`;

  await sendButtons(phone, summary, [
    { id: 'submit', title: 'YES, SUBMIT ✓' },
    { id: 'cancel', title: 'CANCEL' }
  ]);

  return res.status(200).json({ status: 'ready to submit' });
}

async function handleAdditionalDetailsText(phone, text, session, res) {
  if (!text || text.trim().length === 0) {
    await sendMessage(phone, "Please type any flaws or special details, or reply SKIP to continue.");
    return res.status(200).json({ status: 'waiting for details' });
  }

  const existingDetails = session.listing.additional_details || '';
  const newDetails = existingDetails ? `${existingDetails}. ${text.trim()}` : text.trim();

  session.listing.additional_details = newDetails;
  console.log(`📝 Added additional details: ${newDetails}`);

  session.state = 'ready_to_submit';
  await saveSession(phone, session);

  // Show summary
  const listing = session.listing;
  const photoCount = (session.photos || []).filter(p => p.imageUrl).length;

  const summary =
    `📋 *Ready to submit!*\n\n` +
    `📦 ${listing.designer} ${listing.item_type || ''}\n` +
    `📏 Size: ${listing.size}\n` +
    `✨ Condition: ${listing.condition}\n` +
    `💰 Price: $${listing.asking_price_usd}\n` +
    `📸 Photos: ${photoCount}\n` +
    `📝 Notes: ${newDetails.substring(0, 50)}${newDetails.length > 50 ? '...' : ''}\n\n` +
    `Look good?`;

  await sendButtons(phone, summary, [
    { id: 'submit', title: 'YES, SUBMIT ✓' },
    { id: 'cancel', title: 'CANCEL' }
  ]);

  return res.status(200).json({ status: 'ready to submit' });
}

async function askNextMissingField(phone, session, res) {
  const missing = getMissingFields(session.listing);
  console.log(`🔍 Missing fields: ${JSON.stringify(missing)}`);

  if (missing.length === 0) {
    // All required fields complete - ask for PHOTOS FIRST (gives Shopify time to process)
    console.log('✅ All fields complete - asking for photos first');

    // Create Shopify draft NOW (before photos)
    const draftCreated = await createDraftForSession(phone, session);
    if (!draftCreated) {
      await sendMessage(phone, "Oops, couldn't create draft. Reply SUBMIT to try again.");
      return res.status(200).json({ status: 'error creating draft' });
    }

    session.state = 'collecting_photos';
    session.photos = session.photos || [];
    await saveSession(phone, session);

    await sendMessage(phone, `Perfect! 🎉\n\nNow send at least 3 photos:\n\n1️⃣ Front view\n2️⃣ Back view\n3️⃣ Designer tag\n\nJust send them! 📸`);
    return res.status(200).json({ status: 'asked photos' });
  }

  // Ask for next field
  const nextField = missing[0];
  session.current_field = nextField;
  session.state = 'awaiting_missing_field';
  await saveSession(phone, session);

  console.log(`❓ Asking for: ${nextField}`);
  await askForField(phone, nextField);
  return res.status(200).json({ status: `asked ${nextField}` });
}

async function askForField(phone, field) {
  const questions = {
    designer: {
      text: "What designer/brand?",
      note: "e.g., Maria B, Sana Safinaz, Khaadi"
    },
    pieces_included: {
      text: "How many pieces?",
      buttons: [
        { id: 'Kurta', title: 'Kurta only' },
        { id: '2-piece', title: '2-piece' },
        { id: '3-piece', title: '3-piece' }
      ]
    },
    size: {
      text: "What size?",
      list: DROPDOWN_OPTIONS.size.filter(o => o.value).slice(0, 10)
    },
    condition: {
      text: "What condition?",
      list: DROPDOWN_OPTIONS.condition.filter(o => o.value).slice(0, 10)
    },
    asking_price_usd: {
      text: "What price are you asking? (in USD)",
      note: "e.g., 80"
    }
  };

  const q = questions[field];
  if (!q) {
    await sendMessage(phone, `What's the ${field}?`);
    return;
  }

  if (q.buttons) {
    // Use buttons for quick selections
    await sendButtons(phone, q.text, q.buttons);
  } else if (q.list) {
    // Use List Message for cleaner UI (like templates)
    await sendListMessage(phone, q.text, q.list, field);
  } else {
    await sendMessage(phone, q.text + (q.note ? `\n${q.note}` : ''));
  }
}

async function handlePhotoState(phone, text, buttonId, session, res) {
  // Check if already submitted (race condition protection)
  if (session.state === 'submitted') {
    console.log('⏭️  Already submitted - ignoring photo state message');
    return res.status(200).json({ status: 'already submitted' });
  }

  const userText = (text || '').trim().toLowerCase();

  // User says they're done sending photos
  if (userText === 'done' || userText === 'next' || userText === 'continue' || buttonId === 'done') {
    // CRITICAL: Re-fetch session to get latest photos (photos were saved by separate webhook calls)
    const freshSession = await getSession(phone);
    const photoCount = (freshSession.photos || []).filter(p => p.imageUrl).length;
    console.log(`✅ User indicated done with photos. Fresh fetch count: ${photoCount}`);

    // Move to additional details
    freshSession.state = 'awaiting_additional_details';
    await saveSession(phone, freshSession);

    await sendButtons(phone,
      `Great! Got ${photoCount} photo${photoCount !== 1 ? 's' : ''} 📸\n\nAny flaws or special notes?`,
      [
        { id: 'skip_details', title: 'NO, SKIP' },
        { id: 'add_details', title: 'YES, ADD' }
      ]
    );
    return res.status(200).json({ status: 'asked additional details' });
  }

  // Any other text - remind them what to do
  const photoCount = (session.photos || []).filter(p => p.imageUrl).length;
  await sendMessage(phone, `Send photos now (you have ${photoCount}). Text DONE when finished! 📸`);
  return res.status(200).json({ status: 'waiting for photos or done' });
}

async function handlePhoto(phone, mediaId, session, res) {
  try {
    // Small random delay to prevent concurrent updates from overwriting each other
    await new Promise(resolve => setTimeout(resolve, Math.random() * 300));

    // Re-fetch session FIRST to get latest state (in case we just sent them back to collecting_photos)
    const latestSession = await getSession(phone);

    // Check state AFTER re-fetching (not with stale passed-in session)
    if (latestSession.state !== 'collecting_photos') {
      await sendMessage(phone, "Send photos after describing your item.\n\nReply SELL to start.");
      return res.status(200).json({ status: 'unexpected photo' });
    }

    // CRITICAL: Check if already submitted (race condition protection)
    // User might have clicked SUBMIT while photos were still processing
    if (!latestSession || latestSession.state === 'submitted') {
      console.log(`⏭️  Skipping photo - listing already submitted`);
      return res.status(200).json({ status: 'already submitted' });
    }

    // Preserve freshest meta (processedMessages, created_at, etc.) from original session
    // This prevents photo uploads from rolling back idempotency tracking
    latestSession.processedMessages = session.processedMessages || latestSession.processedMessages;
    latestSession.created_at = session.created_at || latestSession.created_at;
    latestSession.prev_state = session.prev_state || latestSession.prev_state;
    latestSession.shopify_product_id = session.shopify_product_id || latestSession.shopify_product_id;

    // Check if draft exists (should have been created before photos)
    if (!latestSession.shopify_product_id) {
      console.error('❌ No Shopify product ID - draft should have been created first!');
      await sendMessage(phone, "Oops, something went wrong. Reply SUBMIT to try again.");
      return res.status(200).json({ status: 'no product id' });
    }

    // Check if this photo already exists (by mediaId)
    latestSession.photos = latestSession.photos || [];
    if (latestSession.photos.some(p => p.mediaId === mediaId)) {
      console.log(`⏭️  Photo ${mediaId} already uploaded, skipping`);
      return res.status(200).json({ status: 'duplicate photo' });
    }

    // Download and compress photo
    let base64;
    if (process.env.TEST_MODE === 'true') {
      // Dummy 1x1 red pixel PNG for testing
      base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      console.log(`🧪 TEST_MODE: Using dummy photo for ${mediaId}`);
    } else {
      // Download, compress, and convert to base64
      const mediaUrl = await getMediaUrl(mediaId);
      const mediaBuffer = await downloadMedia(mediaUrl);
      base64 = await bufferToOptimizedJpegBase64(mediaBuffer);
    }

    // Initialize photos array if needed
    if (!latestSession.photos) {
      latestSession.photos = [];
    }

    // Send acknowledgment ONLY for the very first photo (gives user clear instruction)
    const isFirstPhoto = latestSession.photos.length === 0;
    if (isFirstPhoto) {
      await sendMessage(phone, `Got it! 📸\n\nKeep sending photos. Text DONE when finished.`);
    }

    // Upload directly to Shopify (NEW - use Shopify as CDN)
    // Use mediaId-based filename to avoid race conditions
    console.log(`📸 Uploading photo ${latestSession.photos.length + 1} to Shopify product ${latestSession.shopify_product_id}... (mediaId: ${mediaId})`);

    const uploadPhoto = async (retryCount = 0) => {
      try {
        const photoRes = await fetch(`${API_BASE}/api/wa-product-image?action=add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: latestSession.shopify_product_id,
            base64: base64,
            filename: `wa_${mediaId}.jpg`  // MediaId-based to avoid race conditions
          })
        });

        const photoData = await photoRes.json();

        // Strict validation: only accept if we got a valid URL
        if (!photoData.success || !photoData.imageUrl) {
          if (retryCount === 0) {
            // Retry once after short delay (transient Shopify errors)
            console.log(`⚠️ Photo upload failed, retrying once... (${photoData.error || 'No URL returned'})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return uploadPhoto(1);
          }
          throw new Error(photoData.error || 'No URL returned');
        }

        return photoData;
      } catch (error) {
        if (retryCount === 0) {
          console.log(`⚠️ Photo upload error, retrying once... (${error.message})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return uploadPhoto(1);
        }
        throw error;
      }
    };

    let photoData;
    try {
      photoData = await uploadPhoto();
    } catch (error) {
      console.error(`❌ Photo upload to Shopify failed after retry:`, error.message);
      await sendMessage(phone, "That photo didn't upload—please resend it 📸");
      return res.status(200).json({ status: 'upload failed', error: error.message });
    }

    // Strict validation: must have valid CDN URL (prevents phantom photos)
    const hasValidUrl = photoData.imageUrl &&
                       typeof photoData.imageUrl === 'string' &&
                       photoData.imageUrl.length > 10 &&
                       (photoData.imageUrl.startsWith('http://') || photoData.imageUrl.startsWith('https://'));

    if (!hasValidUrl) {
      console.error(`❌ Photo uploaded but no valid URL - skipping. Got: ${JSON.stringify(photoData.imageUrl)}`);
      await sendMessage(phone, "That photo didn't upload—please resend it 📸");
      return res.status(200).json({ status: 'no url', receivedUrl: photoData.imageUrl });
    }

    console.log(`✅ Validated photo URL: ${photoData.imageUrl}`);

    // Save only the URL (not base64) - Shopify is our CDN now
    latestSession.photos.push({
      imageUrl: photoData.imageUrl,  // Shopify CDN URL
      imageId: photoData.imageId,     // Shopify image ID
      mediaId: mediaId                 // WhatsApp media ID (for deduplication)
    });

    console.log(`💾 Saving session: phone=${phone}, photos.length=${latestSession.photos.length}, state=${latestSession.state}`);
    await saveSession(phone, latestSession);

    // Verify it saved by re-fetching
    const verifySession = await getSession(phone);
    const savedCount = (verifySession.photos || []).filter(p => p.imageUrl).length;
    console.log(`✅ Photo saved! Verified count: ${savedCount}, Latest photo: ${verifySession.photos[verifySession.photos.length - 1]?.imageUrl?.substring(0, 50)}...`);

    // Use .filter to count only photos with valid URLs (prevents counting phantom photos)
    const count = (latestSession.photos || []).filter(p => p.imageUrl).length;
    console.log(`📸 Photo ${count} uploaded to Shopify: ${photoData.imageUrl}`);

    // Done! No batching, no delays, no automatic transitions
    // User will text "DONE" when ready to continue
    return res.status(200).json({ status: 'photo uploaded', count });
  } catch (error) {
    console.error('❌ Photo error:', error);
    await sendMessage(phone, "Photo upload failed. Try again.");
    return res.status(200).json({ status: 'photo error' });
  }
}

async function submitListing(phone, session, res) {
  const listing = session.listing;

  try {
    // Count only photos with valid URLs
    const photoCount = (session.photos || []).filter(p => p.imageUrl).length;

    console.log('📤 Submitting listing...');
    console.log('📦 Session state:', {
      phone: phone,
      photoCount: photoCount,
      totalPhotos: session.photos?.length || 0,
      hasDraftId: !!session.shopify_product_id,
      productId: session.shopify_product_id
    });

    // Check if we already created a draft (should ALWAYS exist now)
    if (session.shopify_product_id) {
      console.log(`✅ Draft exists: ${session.shopify_product_id}`);

      // Clean price for DB insert
      let cleanPrice = listing.asking_price_usd;
      if (typeof cleanPrice === 'string') {
        const match = cleanPrice.match(/(\d+)/);
        if (match) cleanPrice = parseFloat(match[1]);
      }

      // Extract photo URLs (photos already uploaded to Shopify)
      const photoUrls = (session.photos || [])
        .map(p => p.imageUrl)
        .filter(url => url); // Filter out any nulls

      console.log(`📸 Photos already in Shopify: ${photoUrls.length} valid URLs (${session.photos?.length || 0} total entries)`);

      // Require at least 3 photos
      if (photoUrls.length < 3) {
        console.error(`❌ Not enough photos: ${photoUrls.length}/3. Phone: ${phone}, ProductId: ${session.shopify_product_id}`);

        // Send them back to photo collection
        session.state = 'collecting_photos';
        await saveSession(phone, session);

        await sendMessage(phone,
          `⚠️ Need at least 3 photos (you have ${photoUrls.length}).\n\n` +
          `Send ${3 - photoUrls.length} more photos now! 📸`
        );
        return res.status(200).json({
          status: 'need more photos',
          current: photoUrls.length,
          needed: 3 - photoUrls.length
        });
      }

      // Check if listing already exists (idempotency for retry)
      const { data: existing } = await supabase
        .from('listings')
        .select('id')
        .eq('shopify_product_id', session.shopify_product_id)
        .maybeSingle();

      if (existing?.id) {
        console.log(`✅ Listing already exists in DB: ${existing.id}`);
        // Already submitted - just send success message
        await sendMessage(phone,
          `🎉 Already submitted!\n\n` +
          `📦 ${listing.designer} ${listing.item_type || ''}\n` +
          `📏 ${listing.size} • $${cleanPrice}\n\n` +
          `We'll notify you when it's live.\nReply SELL to list another.`
        );

        session.state = 'submitted';
        await saveSession(phone, session);
        await resetSession(phone);

        return res.status(200).json({ status: 'already_submitted', listingId: existing.id });
      }

      // Save to DB (first time)
      console.log(`💾 Inserting listing to DB: phone=${phone}, productId=${session.shopify_product_id}, photoCount=${photoUrls.length}`);

      const { data: createdListing, error: listingError } = await supabase
        .from('listings')
        .insert({
          seller_id: listing._seller_id,
          conversation_id: null,
          status: 'pending_approval',
          input_method: 'whatsapp',
          shopify_product_id: session.shopify_product_id,
          designer: listing.designer,
          item_type: listing.item_type,
          size: listing.size,
          condition: listing.condition,
          pieces_included: listing.pieces_included,
          asking_price_usd: cleanPrice || null,
          details: listing.details,
          additional_details: listing.additional_details || null,
          photo_urls: photoUrls.length > 0 ? photoUrls : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (listingError) {
        console.error(`❌ DB insert failed: phone=${phone}, error=${listingError.message}`);
        throw new Error('Failed to save listing: ' + listingError.message);
      }

      console.log(`✅ DB insert successful: listingId=${createdListing.id}, phone=${phone}, productId=${session.shopify_product_id}`);

      // Mark session as submitted BEFORE sending message (prevents race conditions)
      session.state = 'submitted';
      session.submitted_at = new Date().toISOString();
      await saveSession(phone, session);

      // Success! Send confirmation message
      try {
        console.log(`📤 Sending success message to ${phone}...`);
        await sendMessage(phone,
          `🎉 Submitted!\n\n` +
          `📦 ${listing.designer} ${listing.item_type || ''}\n` +
          `📏 ${listing.size} • $${cleanPrice}\n\n` +
          `We'll notify you when it's live.\nReply SELL to list another.`
        );
        console.log(`✅ Success message sent!`);
      } catch (messageError) {
        // Log but don't fail - listing is already created
        console.error(`⚠️  Success message failed to send (listing still created):`, messageError.message);
      }

      // Note: We DON'T delete the session here to prevent race conditions with photo processing
      // The 'submitted' state handler will reset on next message

      return res.status(200).json({ status: 'submitted', productId: session.shopify_product_id, listingId: createdListing.id });
    }

    // This should never happen - draft should always be created before photos now
    console.error('❌ CRITICAL: No Shopify product ID during SUBMIT! Draft should have been created before photos.');
    await sendMessage(phone,
      `⚠️ Something went wrong.\n\n` +
      `Your listing info is saved. Please reply SUBMIT to try again.\n\n` +
      `Or reply CANCEL to start over.`
    );
    return res.status(200).json({
      status: 'error',
      error: 'No product ID - draft should have been created before photos'
    });

  } catch (error) {
    console.error('❌ Submit error:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Listing data:', JSON.stringify(listing));
    console.error('❌ Session photos:', session.photos?.length || 0);

    await sendMessage(phone, "Oops, something went wrong.\n\nYour info is saved. Reply SUBMIT to try again, or CANCEL to start over.");
    return res.status(200).json({ status: 'error', error: error.message });
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
  if (listing.color) parts.push(`✓ Color: ${listing.color}`);
  if (listing.material) parts.push(`✓ Material: ${listing.material}`);
  if (listing.additional_details) parts.push(`✓ Notes: ${listing.additional_details}`);

  return parts.join('\n');
}

// ============ API CALLS ============

async function callValidateListing(description) {
  const response = await fetch(`${API_BASE}/api/validate-listing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description })
  });
  return await response.json();
}

async function transcribeAudio(mediaId) {
  const mediaUrl = await getMediaUrl(mediaId);
  const audioBuffer = await downloadMedia(mediaUrl);
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
    `https://graph.facebook.com/v18.0/${mediaId}`,
    {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    }
  );
  const data = await response.json();
  return data.url;
}

async function downloadMedia(url) {
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============ SESSION MANAGEMENT ============

async function getSession(phone) {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (data) {
    const listing = data.listing || {};
    const meta = listing._meta || {};

    return {
      state: data.state || 'welcome',
      email: data.email,
      listing: listing,
      photos: data.photos || [],
      current_field: data.current_field,
      // Extract metadata from listing._meta
      created_at: meta.created_at || null, // Don't fallback to updated_at - only use true created_at
      processedMessages: meta.processedMessages || [],
      lastPhotoResponseAt: meta.lastPhotoResponseAt || null,
      shopify_product_id: meta.shopify_product_id || null,
      prev_state: meta.prev_state || null
    };
  }

  return {
    state: 'welcome',
    listing: {},
    photos: [],
    created_at: null, // Will be set on first save
    processedMessages: [],
    lastPhotoResponseAt: null,
    shopify_product_id: null,
    prev_state: null
  };
}

async function saveSession(phone, session) {
  // Store metadata in listing._meta to persist across sessions
  const listing = session.listing || {};

  // Preserve existing created_at if it exists, otherwise set it now (only once)
  const existingCreatedAt = listing._meta?.created_at;

  listing._meta = {
    created_at: existingCreatedAt || session.created_at || new Date().toISOString(),
    processedMessages: session.processedMessages || [],
    lastPhotoResponseAt: session.lastPhotoResponseAt || null,
    shopify_product_id: session.shopify_product_id || null,
    prev_state: session.prev_state || null
  };

  await supabase
    .from('whatsapp_sessions')
    .upsert({
      phone,
      state: session.state,
      email: session.email,
      listing: listing,
      photos: session.photos || [],
      current_field: session.current_field,
      updated_at: new Date().toISOString()
    });
}

async function resetSession(phone) {
  await supabase
    .from('whatsapp_sessions')
    .delete()
    .eq('phone', phone);
}

// ============ MESSAGING ============

async function sendMessage(phone, text) {
  try {
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

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ WhatsApp message send failed (HTTP ${response.status}):`, JSON.stringify(data));
      throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`);
    }

    console.log(`✅ Message sent to ${phone}: "${text.substring(0, 50)}..."`);
    return data;
  } catch (error) {
    console.error(`❌ Failed to send message to ${phone}:`, error.message);
    throw error;
  }
}

async function sendButtons(phone, text, buttons) {
  try {
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

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ WhatsApp buttons send failed (HTTP ${response.status}):`, JSON.stringify(data));
      throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`);
    }

    console.log(`✅ Buttons sent to ${phone}`);
    return data;
  } catch (error) {
    console.error(`❌ Failed to send buttons to ${phone}:`, error.message);
    throw error;
  }
}

async function sendListMessage(phone, text, options, sectionTitle) {
  // Generate descriptive button text based on field
  const buttonText = sectionTitle === 'size' ? 'Select size' :
                     sectionTitle === 'condition' ? 'Select condition' :
                     'Select';

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
        type: 'list',
        body: { text },
        action: {
          button: buttonText,
          sections: [{
            title: sectionTitle.replace(/_/g, ' ').toUpperCase(),
            rows: options.map(o => ({
              id: o.value,
              title: o.label,
              description: o.keywords[0] || ''
            }))
          }]
        }
      }
    })
  });
}
