/**
 * WhatsApp Webhook - Conversational Sell Flow
 * Uses existing APIs: validate-listing, create-draft, product-image, transcribe
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
    const session = await getSession(phone);

    // Get message content
    let text = '';
    let buttonId = null;

    if (message.type === 'text') {
      text = message.text?.body?.trim() || '';
    } else if (message.type === 'interactive') {
      buttonId = message.interactive?.button_reply?.id;
    } else if (message.type === 'audio') {
      // Use existing transcribe API
      try {
        text = await transcribeAudio(message.audio.id);
        await sendMessage(phone, `🎤 I heard: "${text}"`);
      } catch (e) {
        console.error('Transcribe error:', e);
        await sendMessage(phone, "Couldn't transcribe that. Please type instead.");
        return res.status(200).json({ status: 'voice failed' });
      }
    } else if (message.type === 'image') {
      return await handlePhoto(phone, message.image.id, session, res);
    }

    const cmd = text.toLowerCase();
    console.log(`📱 ${phone} [${session.state}]: "${text}" btn=${buttonId}`);

    // Global commands
    if (cmd === 'cancel') {
      await resetSession(phone);
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
    console.error('❌ Webhook error:', error);
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

// ============ State Handlers ============

async function handleWelcome(phone, cmd, session, res) {
  if (cmd === 'sell') {
    session.state = 'awaiting_email';
    await saveSession(phone, session);
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

  // Check if email exists in database
  const { data: existingSeller } = await supabase
    .from('sellers')
    .select('id, name, email, phone')
    .ilike('email', email)
    .maybeSingle();

  let greeting;

  if (existingSeller) {
    // Email exists - check if phone matches
    if (existingSeller.phone && !phonesMatch(existingSeller.phone, phone)) {
      // Phone doesn't match - reject
      await sendMessage(phone,
        "This email is linked to a different phone number.\n\n" +
        "Please text from that phone, or contact admin@thephirstory.com for help."
      );
      return res.status(200).json({ status: 'email mismatch' });
    }

    // Phone matches (or no phone on file) - welcome back
    greeting = `Welcome back${existingSeller.name ? ', ' + existingSeller.name : ''}! ✓`;
    session.sellerId = existingSeller.id;
    session.sellerName = existingSeller.name;

    // Update seller's phone if not set
    if (!existingSeller.phone) {
      await supabase
        .from('sellers')
        .update({ phone: phone })
        .eq('id', existingSeller.id);
    }
  } else {
    // New user - email doesn't exist in database
    greeting = "Looks like you're new here! Welcome to The Phir Story ✨";
    session.sellerId = null;
    session.sellerName = null;
    session.isNewSeller = true;
  }

  // Save email and move to description
  session.email = email;
  session.state = 'awaiting_description';
  await saveSession(phone, session);

  await sendMessage(phone,
    `${greeting}\n\n` +
    `Describe your item (text or voice):\n` +
    `• Designer/brand\n` +
    `• Size\n` +
    `• Condition\n` +
    `• Asking price\n\n` +
    `Example: "Sana Safinaz 3-piece, size M, like new, $80"`
  );
  return res.status(200).json({ status: 'asked description', isNew: !existingSeller });
}

async function handleDescription(phone, text, session, res) {
  if (!text) {
    await sendMessage(phone, "Please describe your item (text or voice message).");
    return res.status(200).json({ status: 'no description' });
  }

  // Use existing validate-listing API
  const validation = await callValidateListing(text);
  console.log('🤖 Validation result:', validation);

  session.listing = {
    ...session.listing,
    ...validation.extracted,
    description: text
  };
  session.aiMessage = validation.message;
  await saveSession(phone, session);

  if (validation.isComplete) {
    // All required fields extracted, show confirmation
    return await showConfirmation(phone, session, res);
  }

  // Ask for missing fields
  return await askNextMissing(phone, session, validation.missing, res);
}

async function handleField(phone, text, buttonId, session, res) {
  const field = session.currentField;
  const value = buttonId || text;

  if (!value) {
    return res.status(200).json({ status: 'no value' });
  }

  // Map button IDs to field values
  session.listing[field] = value;
  await saveSession(phone, session);

  // Re-validate with updated data
  const desc = buildDescription(session.listing);
  const validation = await callValidateListing(desc);

  session.listing = { ...session.listing, ...validation.extracted };
  await saveSession(phone, session);

  if (validation.isComplete || validation.missing.length === 0) {
    return await showConfirmation(phone, session, res);
  }

  return await askNextMissing(phone, session, validation.missing, res);
}

async function handleConfirmation(phone, text, buttonId, session, res) {
  const response = buttonId || text.toLowerCase();

  if (response === 'yes' || response.includes('yes')) {
    session.state = 'awaiting_photos';
    session.photos = session.photos || [];
    // Include any early photos
    if (session.earlyPhotos?.length) {
      session.photos = [...session.photos, ...session.earlyPhotos];
      session.earlyPhotos = [];
    }
    await saveSession(phone, session);

    const photoCount = session.photos.length;
    if (photoCount >= 3) {
      await sendMessage(phone, `Got it! (${photoCount} photos) ✓`);
      await sendButtons(phone, "Ready to submit, or send more photos.", [
        { id: 'submit', title: 'SUBMIT ✓' },
        { id: 'add_more', title: 'ADD MORE' }
      ]);
    } else {
      await sendMessage(phone,
        `Send ${3 - photoCount}+ photos:\n` +
        `📸 Front view\n` +
        `📸 Back view\n` +
        `📸 Brand tag\n\n` +
        `Send all at once or one by one.`
      );
    }
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

  if (response.startsWith('edit_')) {
    const field = response.replace('edit_', '');
    session.currentField = field === 'price' ? 'asking_price' : field;
    session.state = 'awaiting_field';
    await saveSession(phone, session);
    await sendMessage(phone, `What's the new ${field}?`);
    return res.status(200).json({ status: 'editing field' });
  }

  return res.status(200).json({ status: 'unknown confirmation' });
}

async function handlePhotosState(phone, text, buttonId, session, res) {
  if (buttonId === 'submit' || text.toLowerCase() === 'submit') {
    return await submitListing(phone, session, res);
  }

  if (buttonId === 'add_more') {
    await sendMessage(phone, "Send more photos. Tap SUBMIT when done.");
    return res.status(200).json({ status: 'waiting more photos' });
  }

  await sendMessage(phone, "Please send photos of your item, or tap SUBMIT if done.");
  return res.status(200).json({ status: 'waiting photos' });
}

async function handlePhoto(phone, mediaId, session, res) {
  // Download image
  const imageData = await downloadMedia(mediaId);

  if (session.state !== 'awaiting_photos') {
    // Save for later
    session.earlyPhotos = session.earlyPhotos || [];
    session.earlyPhotos.push(imageData);
    await saveSession(phone, session);

    if (session.state === 'welcome') {
      await sendMessage(phone, "Got the photo! 📸 Reply SELL to start listing your item.");
    } else {
      await sendMessage(phone, "Got the photo! 📸 I'll add it to your listing.");
    }
    return res.status(200).json({ status: 'photo saved early' });
  }

  // Add photo
  session.photos = session.photos || [];
  session.photos.push(imageData);
  await saveSession(phone, session);

  const count = session.photos.length;

  if (count < 3) {
    await sendMessage(phone, `Got it! (${count} photo${count > 1 ? 's' : ''}) - send ${3 - count} more`);
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

async function showConfirmation(phone, session, res) {
  session.state = 'awaiting_confirmation';
  await saveSession(phone, session);

  const l = session.listing;
  const summary = `Here's your listing:\n\n` +
    `📦 ${l.designer || 'Unknown'} - ${l.item_type || 'Item'}\n` +
    `📏 Size: ${l.size || '?'}\n` +
    `✨ Condition: ${l.condition || '?'}\n` +
    `💰 Price: $${l.asking_price || '?'}\n` +
    (l.color ? `🎨 ${l.color}\n` : '') +
    (l.material ? `🧵 ${l.material}\n` : '');

  await sendMessage(phone, summary);
  await sendButtons(phone, "Look good?", [
    { id: 'yes', title: 'YES ✓' },
    { id: 'update', title: 'UPDATE' }
  ]);

  return res.status(200).json({ status: 'asked confirmation' });
}

async function askNextMissing(phone, session, missing, res) {
  if (!missing || missing.length === 0) {
    return await showConfirmation(phone, session, res);
  }

  const field = missing[0];
  session.currentField = field;
  session.state = 'awaiting_field';
  await saveSession(phone, session);

  // Send AI message if available, otherwise ask directly
  if (session.aiMessage) {
    await sendMessage(phone, session.aiMessage);
    session.aiMessage = null;
    await saveSession(phone, session);
  } else {
    const question = getFieldQuestion(field);
    if (question.buttons) {
      await sendButtons(phone, question.text, question.buttons);
    } else {
      await sendMessage(phone, question.text);
    }
  }

  return res.status(200).json({ status: `asked ${field}` });
}

function getFieldQuestion(field) {
  switch (field) {
    case 'designer':
      return { text: "What's the designer/brand?" };
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
    case 'asking_price':
      return { text: "What's your asking price in USD?" };
    default:
      return { text: `What's the ${field}?` };
  }
}

function buildDescription(listing) {
  const parts = [];
  if (listing.designer) parts.push(listing.designer);
  if (listing.item_type) parts.push(listing.item_type);
  if (listing.size) parts.push(`size ${listing.size}`);
  if (listing.condition) parts.push(listing.condition);
  if (listing.asking_price) parts.push(`$${listing.asking_price}`);
  if (listing.color) parts.push(listing.color);
  if (listing.material) parts.push(listing.material);
  return parts.join(', ') || listing.description || '';
}

async function submitListing(phone, session, res) {
  const listing = session.listing;

  try {
    // Call existing create-draft API
    const draftRes = await fetch(`${API_BASE}/api/create-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: session.email,
        phone: phone,
        description: listing.description,
        extracted: {
          designer: listing.designer,
          item_type: listing.item_type,
          size: listing.size,
          condition: listing.condition,
          asking_price: listing.asking_price,
          color: listing.color,
          material: listing.material
        }
      })
    });

    const draftData = await draftRes.json();
    console.log('📦 Draft created:', draftData);

    if (!draftData.success || !draftData.productId) {
      throw new Error(draftData.error || 'Failed to create draft');
    }

    // Upload photos using existing product-image API
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
          console.error(`Photo ${i + 1} upload failed:`, e);
        }
      }
    }

    // Reset session
    await resetSession(phone);

    await sendMessage(phone,
      `🎉 Submitted for review!\n\n` +
      `📦 ${listing.designer || 'Item'} - ${listing.item_type || ''}\n` +
      `📏 Size ${listing.size || '?'} | $${listing.asking_price || '?'}\n\n` +
      `We'll notify you when it's live.\n\n` +
      `Reply SELL to list another item.`
    );

    return res.status(200).json({ status: 'submitted', productId: draftData.productId });

  } catch (error) {
    console.error('Submit error:', error);
    await sendMessage(phone, "Something went wrong. Please try again or email admin@thephirstory.com");
    return res.status(200).json({ status: 'submit failed', error: error.message });
  }
}

// ============ External API Calls ============

async function callValidateListing(description) {
  try {
    const response = await fetch(`${API_BASE}/api/validate-listing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    return await response.json();
  } catch (e) {
    console.error('Validate listing error:', e);
    return {
      extracted: {},
      missing: ['designer', 'size', 'condition', 'asking_price'],
      isComplete: false,
      message: "Could you tell me: designer, size, condition, and price?"
    };
  }
}

async function transcribeAudio(mediaId) {
  // Download audio from WhatsApp
  const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const mediaInfo = await mediaRes.json();

  const audioRes = await fetch(mediaInfo.url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  const audioBuffer = await audioRes.arrayBuffer();
  const base64 = Buffer.from(audioBuffer).toString('base64');

  // Call existing transcribe API
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
  const digits1 = phone1?.replace(/\D/g, '').slice(-10);
  const digits2 = phone2?.replace(/\D/g, '').slice(-10);
  return digits1 === digits2;
}

// ============ Session Management (Supabase) ============

async function getSession(phone) {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (data) {
    return {
      state: data.state || 'welcome',
      email: data.email,
      sellerId: data.seller_id,
      sellerName: data.seller_name,
      listing: data.listing || {},
      photos: data.photos || [],
      earlyPhotos: data.early_photos || [],
      currentField: data.current_field,
      aiMessage: data.ai_message
    };
  }

  return { state: 'welcome', listing: {}, photos: [], earlyPhotos: [] };
}

async function saveSession(phone, session) {
  await supabase
    .from('whatsapp_sessions')
    .upsert({
      phone,
      state: session.state,
      email: session.email || null,
      seller_id: session.sellerId || null,
      seller_name: session.sellerName || null,
      listing: session.listing || {},
      photos: session.photos || [],
      early_photos: session.earlyPhotos || [],
      current_field: session.currentField || null,
      ai_message: session.aiMessage || null,
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
      seller_id: null,
      seller_name: null,
      listing: {},
      photos: [],
      early_photos: [],
      current_field: null,
      ai_message: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone' });
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
