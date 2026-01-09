/**
 * WhatsApp Webhook
 * Handles: text, voice, images, and Flow submissions
 */

import OpenAI from 'openai';

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'tps123';
const FLOW_ID = process.env.WHATSAPP_FLOW_ID || '1068790168720795';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Pakistani fashion context for transcription
const FASHION_PROMPT = `Pakistani designer clothing description. Terms: kurta, kameez, dupatta, gharara, sharara, lehenga. Designers: Sana Safinaz, Maria B, Khaadi, Gul Ahmed, Asim Jofa, Zara Shahjahan, Elan. Fabrics: lawn, chiffon, organza, silk. Embroidery: thread work, mirror work, sequins, zardozi.`;

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

  // Handle incoming messages (POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse WhatsApp message
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.status(200).json({ status: 'no message' });
    }

    const phone = message.from;

    // Handle Flow submission (nfm_reply)
    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      const responseJson = message.interactive.nfm_reply?.response_json;
      console.log('📋 FLOW SUBMITTED from:', phone);
      console.log('📋 Raw response_json:', responseJson);

      if (responseJson) {
        const flowData = JSON.parse(responseJson);
        console.log('📋 Parsed flow data:', JSON.stringify(flowData, null, 2));
      }

      await sendMessage(phone, 'Got your submission! (Testing - check logs)');
      return res.status(200).json({ status: 'flow submission logged' });
    }

    // Handle voice message
    if (message.type === 'audio') {
      const mediaId = message.audio?.id;
      console.log('🎤 Voice message from:', phone, 'mediaId:', mediaId);

      await sendMessage(phone, '🎤 Got your voice message, transcribing...');

      try {
        const transcription = await transcribeVoiceMessage(mediaId);
        console.log('📝 Transcription:', transcription);

        await sendMessage(phone, `📝 Here's what I heard:\n\n"${transcription}"\n\nIs this correct?`);
        return res.status(200).json({ status: 'voice transcribed', text: transcription });
      } catch (err) {
        console.error('❌ Transcription error:', err.message);
        await sendMessage(phone, "Sorry, I couldn't transcribe that. Please try again or type your description.");
        return res.status(200).json({ status: 'transcription failed', error: err.message });
      }
    }

    // Handle image message
    if (message.type === 'image') {
      const mediaId = message.image?.id;
      const caption = message.image?.caption || '';
      console.log('📷 Image from:', phone, 'mediaId:', mediaId, 'caption:', caption);

      await sendMessage(phone, '📷 Got your photo! Send more photos or reply DONE when finished.');
      return res.status(200).json({ status: 'image received', mediaId });
    }

    const text = message.text?.body?.toLowerCase()?.trim() || '';
    console.log(`📱 From ${phone}: "${text}"`);

    // "sell" → send Flow form
    if (text === 'sell') {
      await sendFlow(phone);
      return res.status(200).json({ status: 'flow sent' });
    }

    // "info" → send links
    if (text === 'info') {
      await sendMessage(phone,
        `📍 Your listings: sell.thephirstory.com\n` +
        `🛍️ Shop outfits: thephirstory.com\n` +
        `📧 Need help? admin@thephirstory.com`
      );
      return res.status(200).json({ status: 'info sent' });
    }

    // Otherwise → welcome message
    await sendMessage(phone,
      `Thanks for messaging The Phir Story! ✨\n\n` +
      `To list & sell your outfit, reply SELL\n` +
      `For links & help, reply INFO`
    );
    return res.status(200).json({ status: 'welcome sent' });

  } catch (error) {
    console.error('❌ Error:', error.message);
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

/**
 * Send WhatsApp Flow form
 */
async function sendFlow(phone) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'text',
        text: 'List Your Item'
      },
      body: {
        text: 'Fill out this form to list your item for sale!'
      },
      footer: {
        text: 'The Phir Story'
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: FLOW_ID,
          flow_cta: 'Start Listing',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'OUTFIT'
          }
        }
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  console.log('📤 Flow sent:', result);
  return result;
}

/**
 * Send text message
 */
async function sendMessage(phone, text) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: { body: text }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  console.log('📤 Message sent:', result);
  return result;
}

/**
 * Send interactive buttons
 * @param {string} phone - recipient phone
 * @param {string} bodyText - message body
 * @param {Array} buttons - [{id: 'btn_1', title: 'Yes'}]
 * @param {string} [header] - optional header text
 */
async function sendButtons(phone, bodyText, buttons, header = null) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;

  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.map(btn => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title }
      }))
    }
  };

  if (header) {
    interactive.header = { type: 'text', text: header };
  }

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  console.log('📤 Buttons sent:', result);
  return result;
}

/**
 * Send interactive list
 * @param {string} phone - recipient phone
 * @param {string} bodyText - message body
 * @param {string} buttonText - text on the list button
 * @param {Array} sections - [{title: 'Options', rows: [{id, title, description}]}]
 */
async function sendList(phone, bodyText, buttonText, sections) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  console.log('📤 List sent:', result);
  return result;
}

/**
 * Download media from WhatsApp and transcribe with Whisper
 */
async function transcribeVoiceMessage(mediaId) {
  // Step 1: Get media URL from WhatsApp
  const mediaUrl = `https://graph.facebook.com/v18.0/${mediaId}`;
  const mediaRes = await fetch(mediaUrl, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });

  if (!mediaRes.ok) {
    throw new Error('Failed to get media URL');
  }

  const mediaInfo = await mediaRes.json();
  console.log('📥 Media info:', mediaInfo);

  // Step 2: Download the actual audio file
  const audioRes = await fetch(mediaInfo.url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });

  if (!audioRes.ok) {
    throw new Error('Failed to download audio');
  }

  const audioBuffer = await audioRes.arrayBuffer();
  console.log('📥 Downloaded audio:', audioBuffer.byteLength, 'bytes');

  // Step 3: Send to OpenAI Whisper
  const audioFile = new File([audioBuffer], 'voice.ogg', { type: 'audio/ogg' });

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    prompt: FASHION_PROMPT,
    language: 'en'
  });

  return transcription.text;
}

/**
 * Extract structured listing data from description using GPT
 */
async function extractListingDetails(description) {
  const systemPrompt = `You extract structured data from Pakistani designer clothing descriptions.
Return JSON with these fields:
- designer: brand name (Sana Safinaz, Maria B, Khaadi, Gul Ahmed, Asim Jofa, Zara Shahjahan, Elan, etc.)
- item_type: type of clothing (kurta, suit, lehenga, sharara, gharara, dress, etc.)
- size: XS, S, M, L, XL, or specific measurements
- color: main color(s)
- condition: new with tags, like new, good, fair
- material: lawn, chiffon, silk, organza, cotton, etc.
- asking_price: number only, no currency symbol
- additional_details: any other relevant info

If a field cannot be determined, use null.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: description }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2
  });

  const result = JSON.parse(response.choices[0].message.content);
  console.log('🤖 Extracted:', result);
  return result;
}

/**
 * Download image from WhatsApp
 * Returns base64 encoded image
 */
async function downloadImage(mediaId) {
  // Step 1: Get media URL
  const mediaUrl = `https://graph.facebook.com/v18.0/${mediaId}`;
  const mediaRes = await fetch(mediaUrl, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });

  if (!mediaRes.ok) {
    throw new Error('Failed to get media URL');
  }

  const mediaInfo = await mediaRes.json();

  // Step 2: Download the image
  const imageRes = await fetch(mediaInfo.url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });

  if (!imageRes.ok) {
    throw new Error('Failed to download image');
  }

  const imageBuffer = await imageRes.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString('base64');

  return {
    base64,
    mimeType: mediaInfo.mime_type || 'image/jpeg',
    size: imageBuffer.byteLength
  };
}
