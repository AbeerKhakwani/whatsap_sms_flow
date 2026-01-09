/**
 * WhatsApp Webhook - Clean MVP for Sunday Demo
 * Flow: SELL → email auth → description → missing fields → photos → submit
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
        session.listing = { _seller_id: session.listing._seller_id };
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

      case 'collecting_photos':
        return await handlePhotoState(phone, text, buttonId, session, res);

      case 'awaiting_additional_details':
        return await handleAdditionalDetails(phone, text, buttonId, session, res);

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

    // Welcome back
    session.email = email;
    session.listing = { _seller_id: seller.id, _seller_name: seller.name };
    session.state = 'awaiting_description';
    session.created_at = session.created_at || new Date().toISOString();
    await saveSession(phone, session);

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

    session.listing = { _seller_id: newSeller.id };
    session.state = 'awaiting_description';
    session.created_at = session.created_at || new Date().toISOString();
    await saveSession(phone, session);

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
      const photoCount = session.photos?.length || 0;
      session.state = 'collecting_photos';
      session.prev_state = null; // Clear prev_state
      await saveSession(phone, session);

      if (photoCount >= 3) {
        await sendButtons(phone, `You have ${photoCount} photos.\n\nReady to submit?`, [
          { id: 'submit', title: 'SUBMIT ✓' },
          { id: 'add_more', title: 'ADD MORE' }
        ]);
      } else {
        await sendMessage(phone, `You have ${photoCount} photos. Send ${3 - photoCount} more 📸`);
      }
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

async function askNextMissingField(phone, session, res) {
  const missing = getMissingFields(session.listing);
  console.log(`🔍 Missing fields: ${JSON.stringify(missing)}`);

  if (missing.length === 0) {
    // All complete - ask for photos
    session.state = 'collecting_photos';
    session.photos = session.photos || [];
    await saveSession(phone, session);

    await sendMessage(phone, `Perfect! Now send 3+ photos:\n\n1️⃣ Front view\n2️⃣ Back view\n3️⃣ Designer tag\n\nJust send them one by one 📸`);
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
  const response = (buttonId || text).toLowerCase();
  const photoCount = (session.photos || []).length;

  if (response === 'submit' && photoCount >= 3) {
    // Submit directly without asking for additional details
    console.log('📤 User requested submit with sufficient photos - submitting directly');
    return await submitListing(phone, session, res);
  }

  if (photoCount < 3) {
    await sendMessage(phone, `Still need ${3 - photoCount} more photo(s).\nJust send them! 📸`);
    return res.status(200).json({ status: 'waiting for photos' });
  }

  // >= 3 photos, show submit option
  await sendButtons(phone, `Got ${photoCount} photos!\n\nReady to submit?`, [
    { id: 'submit', title: 'SUBMIT ✓' },
    { id: 'add_more', title: 'ADD MORE' }
  ]);
  return res.status(200).json({ status: 'ready to submit' });
}

async function handleAdditionalDetails(phone, text, buttonId, session, res) {
  const response = (buttonId || text).trim();
  const lowerResponse = response.toLowerCase();

  // Accept button ID or various text responses meaning "skip/submit"
  if (response === 'skip_details' ||
      lowerResponse === 'skip' ||
      lowerResponse === 'submit' ||
      lowerResponse.includes('ready to submit')) {
    // Skip details, go straight to submit
    console.log('📤 Skipping additional details, submitting...');
    return await submitListing(phone, session, res);
  }

  // They provided details - save and submit
  session.listing.additional_details = response;
  await saveSession(phone, session);

  console.log(`📝 Additional details: "${response}" - submitting...`);
  await sendMessage(phone, "Got it! Submitting now...");
  return await submitListing(phone, session, res);
}

async function handlePhoto(phone, mediaId, session, res) {
  if (session.state !== 'collecting_photos') {
    await sendMessage(phone, "Send photos after describing your item.\n\nReply SELL to start.");
    return res.status(200).json({ status: 'unexpected photo' });
  }

  try {
    // Small random delay to prevent concurrent updates from overwriting each other
    await new Promise(resolve => setTimeout(resolve, Math.random() * 300));

    // Re-fetch session to get latest photo count
    const latestSession = await getSession(phone);

    // Download and convert to base64
    const mediaUrl = await getMediaUrl(mediaId);
    const mediaBuffer = await downloadMedia(mediaUrl);
    const base64 = mediaBuffer.toString('base64');

    latestSession.photos = latestSession.photos || [];

    // Check if this photo already exists (by mediaId)
    if (latestSession.photos.some(p => p.mediaId === mediaId)) {
      console.log(`⏭️  Photo ${mediaId} already saved, skipping`);
      return res.status(200).json({ status: 'duplicate photo' });
    }

    latestSession.photos.push({ base64, mediaId });

    const count = latestSession.photos.length;
    await saveSession(phone, latestSession);
    console.log(`📸 Photo ${count}/3 saved (mediaId: ${mediaId})`);

    // Wait 2 seconds to batch rapid uploads before responding
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Re-check count after delay (in case more came in)
    const finalSession = await getSession(phone);
    const finalCount = (finalSession.photos || []).length;
    console.log(`📸 Final count after delay: ${finalCount}`);

    // Only respond if we haven't already responded for this batch
    // Check if we sent a message in the last 5 seconds
    const lastPhotoResponse = finalSession.lastPhotoResponseAt;
    const now = Date.now();
    if (lastPhotoResponse && now - lastPhotoResponse < 5000) {
      console.log(`📸 Already responded ${Math.round((now - lastPhotoResponse) / 1000)}s ago, skipping`);
      return res.status(200).json({ status: 'already responded' });
    }

    // Mark that we're responding
    finalSession.lastPhotoResponseAt = now;
    await saveSession(phone, finalSession);

    // Respond based on final count
    if (finalCount < 3) {
      await sendMessage(phone, `Got ${finalCount}/3 photos. Send ${3 - finalCount} more 📸`);
      return res.status(200).json({ status: `photo ${finalCount}` });
    } else {
      await sendButtons(phone, `Perfect! Got ${finalCount} photos.\n\nReady to submit?`, [
        { id: 'submit', title: 'SUBMIT ✓' },
        { id: 'add_more', title: 'ADD MORE' }
      ]);
      return res.status(200).json({ status: 'ready to submit' });
    }
  } catch (error) {
    console.error('❌ Photo error:', error);
    await sendMessage(phone, "Photo upload failed. Try again.");
    return res.status(200).json({ status: 'photo error' });
  }
}

async function submitListing(phone, session, res) {
  const listing = session.listing;

  try {
    console.log('📤 Submitting listing...');
    console.log('📦 Session state:', {
      hasPhotos: session.photos?.length || 0,
      hasDraftId: !!session.shopify_product_id,
      existingDraftId: session.shopify_product_id
    });

    // Check if we already created a draft (retry scenario)
    if (session.shopify_product_id) {
      console.log(`♻️  Reusing existing draft: ${session.shopify_product_id}`);

      // Clean price for DB insert
      let cleanPrice = listing.asking_price_usd;
      if (typeof cleanPrice === 'string') {
        const match = cleanPrice.match(/(\d+)/);
        if (match) cleanPrice = parseFloat(match[1]);
      }

      // Skip to photo upload
      const photoUrls = [];
      if (session.photos?.length > 0) {
        console.log(`📸 Uploading ${session.photos.length} photos to existing draft...`);
        // Upload photos to existing draft
        for (let i = 0; i < session.photos.length; i++) {
          const photo = session.photos[i];
          try {
            const photoRes = await fetch(`${API_BASE}/api/product-image?action=add`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: session.shopify_product_id,
                base64: photo.base64,
                filename: `photo_${i + 1}.jpg`
              })
            });

            const photoData = await photoRes.json();
            if (photoData.success && photoData.imageUrl) {
              photoUrls.push(photoData.imageUrl);
            }
          } catch (e) {
            console.error(`❌ Photo ${i + 1} error on retry:`, e.message);
          }
        }
      }

      // Save to DB
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
        throw new Error('Failed to save listing: ' + listingError.message);
      }

      // Success!
      await sendMessage(phone,
        `🎉 Submitted!\n\n` +
        `📦 ${listing.designer} ${listing.item_type || ''}\n` +
        `📏 ${listing.size} • $${cleanPrice}\n\n` +
        `We'll notify you when it's live.\nReply SELL to list another.`
      );

      session.state = 'submitted';
      await saveSession(phone, session);
      await resetSession(phone);

      return res.status(200).json({ status: 'submitted (retry)', productId: session.shopify_product_id });
    }

    // Fresh submission - validate price first
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
      throw new Error('Invalid price. Please provide a valid number.');
    }

    console.log('💰 Price validation: original=', listing.asking_price_usd, 'cleaned=', askingPrice);

    // 1. Create Shopify draft
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
        }
      })
    });

    const draftData = await draftRes.json();
    console.log('📦 Draft response:', draftData);

    if (!draftData.success || !draftData.productId) {
      throw new Error(draftData.error || 'Failed to create draft');
    }

    // Save product ID to session immediately so we can retry without duplicates
    session.shopify_product_id = draftData.productId;
    await saveSession(phone, session);
    console.log(`✅ Saved draft ID to session: ${draftData.productId}`);

    // 2. Upload photos
    console.log(`📸 Uploading ${session.photos?.length || 0} photos to Shopify product ${draftData.productId}...`);
    const photoUrls = [];
    if (session.photos?.length > 0) {
      for (let i = 0; i < session.photos.length; i++) {
        const photo = session.photos[i];
        try {
          console.log(`📸 Uploading photo ${i + 1}/${session.photos.length} (mediaId: ${photo.mediaId})...`);

          const photoRes = await fetch(`${API_BASE}/api/product-image?action=add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: draftData.productId,
              base64: photo.base64,
              filename: `photo_${i + 1}.jpg`
            })
          });

          console.log(`📸 Photo ${i + 1} response status: ${photoRes.status} ${photoRes.statusText}`);

          if (!photoRes.ok) {
            const errorText = await photoRes.text();
            console.error(`❌ Photo ${i + 1} HTTP error: ${errorText}`);
            continue;
          }

          const photoData = await photoRes.json();
          console.log(`📸 Photo ${i + 1} response data:`, JSON.stringify(photoData));

          if (photoData.success && photoData.imageUrl) {
            console.log(`✅ Photo ${i + 1} uploaded successfully - URL: ${photoData.imageUrl}`);
            photoUrls.push(photoData.imageUrl);
          } else {
            console.error(`❌ Photo ${i + 1} upload failed:`, photoData.error || 'Unknown error');
          }
        } catch (e) {
          console.error(`❌ Photo ${i + 1} exception:`, e.message, e.stack);
        }
      }
    }
    console.log(`📸 Upload complete: ${photoUrls.length}/${session.photos?.length || 0} photos succeeded`);

    // 3. Create listings row
    const { data: createdListing, error: listingError } = await supabase
      .from('listings')
      .insert({
        seller_id: listing._seller_id,
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
        additional_details: listing.additional_details || null,
        photo_urls: photoUrls.length > 0 ? photoUrls : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (listingError) {
      console.error('❌ Failed to create listing in DB:', listingError);
      throw new Error('Failed to save listing: ' + listingError.message);
    }

    console.log('✅ Listing created in DB:', createdListing?.id);

    // 4. Success message
    await sendMessage(phone,
      `🎉 Submitted!\n\n` +
      `📦 ${listing.designer} ${listing.item_type || ''}\n` +
      `📏 ${listing.size} • $${listing.asking_price_usd}\n\n` +
      `We'll notify you when it's live.\nReply SELL to list another.`
    );

    // 5. Reset session
    session.state = 'submitted';
    await saveSession(phone, session);
    await resetSession(phone);

    return res.status(200).json({ status: 'submitted', productId: draftData.productId });

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
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    })
  });
}

async function sendListMessage(phone, text, options, sectionTitle) {
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
          button: 'Choose',
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
