/**
 * WhatsApp Flow Encrypted Data Exchange Endpoint
 *
 * Handles encrypted communication with WhatsApp Flows:
 * - Health check (ping)
 * - INIT action (pre-fill form with AI-extracted data)
 * - data_exchange (screen navigation)
 * - Photo handling from PhotoPicker
 *
 * Encryption: RSA-OAEP (key exchange) + AES-128-GCM (payload)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PRIVATE_KEY = process.env.WHATSAPP_PRIVATE_KEY?.replace(/\\n/g, '\n');
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.replace(/\\n/g, '');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============ ENCRYPTION/DECRYPTION ============

/**
 * Decrypt the AES key using RSA-OAEP with SHA-256
 */
function decryptAesKey(encryptedAesKey) {
  const encryptedBuffer = Buffer.from(encryptedAesKey, 'base64');

  const decryptedKey = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    encryptedBuffer
  );

  return decryptedKey;
}

/**
 * Decrypt the flow data using AES-128-GCM
 */
function decryptFlowData(encryptedFlowData, aesKey, iv) {
  const encryptedBuffer = Buffer.from(encryptedFlowData, 'base64');
  const ivBuffer = Buffer.from(iv, 'base64');

  // AES-GCM: last 16 bytes are the authentication tag
  const TAG_LENGTH = 16;
  const authTag = encryptedBuffer.slice(-TAG_LENGTH);
  const ciphertext = encryptedBuffer.slice(0, -TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, ivBuffer);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, null, 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Encrypt the response using AES-128-GCM with flipped IV
 */
function encryptResponse(response, aesKey, iv) {
  const ivBuffer = Buffer.from(iv, 'base64');

  // Flip the IV by XORing each byte with 0xFF (Meta's requirement)
  const flippedIv = Buffer.alloc(ivBuffer.length);
  for (let i = 0; i < ivBuffer.length; i++) {
    flippedIv[i] = ivBuffer[i] ^ 0xFF;
  }

  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);

  const responseStr = JSON.stringify(response);
  let encrypted = cipher.update(responseStr, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Append auth tag
  const authTag = cipher.getAuthTag();
  const result = Buffer.concat([encrypted, authTag]);

  return result.toString('base64');
}

// ============ FLOW ACTION HANDLERS ============

/**
 * Handle INIT action - return initial screen with pre-filled data
 */
async function handleInit(decryptedData, aesKey) {
  const { flow_token } = decryptedData;
  console.log('🚀 INIT with flow_token:', flow_token);

  let prefillData = {
    brand: '',
    pieces: '',
    size: '',
    condition: '',
    price: '',
    chest: '',
    hip: '',
    color: '',
    fabric: '',
    notes: ''
  };

  // flow_token format: "prefill_{phone}" or "fresh_{phone}"
  if (flow_token?.startsWith('prefill_')) {
    // Extract phone - handle + sign and any trailing parts
    const phone = flow_token.replace('prefill_', '');
    console.log('📋 Looking up pre-fill data for phone:', phone);

    // Look up the conversation context for extracted data
    const { data: conv } = await supabase
      .from('sms_conversations')
      .select('context')
      .eq('phone_number', phone)
      .single();

    if (conv?.context?.extracted_data) {
      const extracted = conv.context.extracted_data;
      prefillData = {
        brand: extracted.designer || '',
        pieces: extracted.pieces || '',
        size: extracted.size || '',
        condition: extracted.condition || '',
        price: extracted.asking_price?.toString() || '',
        chest: extracted.chest?.toString() || '',
        hip: extracted.hip?.toString() || '',
        color: extracted.color || '',
        fabric: extracted.fabric || '',
        notes: extracted.notes || ''
      };
      console.log('✅ Pre-filling with:', prefillData);
    }
  }

  return {
    screen: 'REQUIRED_DETAILS',
    data: prefillData
  };
}

/**
 * Handle data_exchange - process screen submissions and navigate
 */
async function handleDataExchange(decryptedData, aesKey) {
  const { screen, data, flow_token } = decryptedData;
  console.log(`📝 data_exchange - Screen: ${screen}`);

  switch (screen) {
    case 'REQUIRED_DETAILS':
      // Move to optional details
      return {
        screen: 'OPTIONAL_DETAILS',
        data: {
          brand: data.brand || '',
          pieces: data.pieces || '',
          size: data.size || '',
          condition: data.condition || '',
          price: data.price || '',
          chest: data.chest || '',
          hip: data.hip || '',
          color: '',
          fabric: '',
          notes: ''
        }
      };

    case 'OPTIONAL_DETAILS':
      // Move to photos
      return {
        screen: 'PHOTOS',
        data: {
          brand: data.brand || '',
          pieces: data.pieces || '',
          size: data.size || '',
          condition: data.condition || '',
          price: data.price || '',
          chest: data.chest || '',
          hip: data.hip || '',
          color: data.color || '',
          fabric: data.fabric || '',
          notes: data.notes || ''
        }
      };

    case 'PHOTOS':
      // Photos screen - create Shopify product and upload photos
      console.log('📸 Processing photos and creating Shopify product...');

      try {
        // Extract phone from flow_token (format: "prefill_PHONE" or "fresh_PHONE")
        const phone = flow_token?.replace('prefill_', '').replace('fresh_', '').split('_')[0];

        if (!phone) {
          console.error('❌ No phone in flow_token:', flow_token);
          throw new Error('Missing phone number');
        }

        // Get seller info
        const { data: conv } = await supabase
          .from('sms_conversations')
          .select('seller_id, context')
          .eq('phone_number', phone)
          .single();

        const { data: seller } = await supabase
          .from('sellers')
          .select('email, phone')
          .eq('id', conv.seller_id)
          .single();

        // Create Shopify draft product
        const API_BASE = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'https://sell.thephirstory.com';

        console.log('📦 Creating Shopify draft...');
        const draftRes = await fetch(`${API_BASE}/api/create-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: seller.email,
            phone: seller.phone,
            description: conv.context?.original_description || '',
            extracted: {
              designer: data.brand,
              item_type: data.pieces,
              size: data.size,
              condition: data.condition,
              asking_price: parseInt(data.price) || 0
            }
          })
        });

        const draftData = await draftRes.json();
        if (!draftData.success) throw new Error(draftData.error || 'Draft failed');

        const productId = draftData.productId;
        console.log('✅ Draft created:', productId);

        // Handle photos from PhotoPicker
        // Photos come as encrypted media that we need to decrypt
        const photos = data.photos || [];
        console.log(`📸 Processing ${photos.length} photos...`);

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          console.log(`  Uploading photo ${i + 1}/${photos.length}...`);

          // If photo has media_id, download from WhatsApp
          if (photo.media_id) {
            try {
              // Get media URL
              const mediaRes = await fetch(`https://graph.facebook.com/v21.0/${photo.media_id}`, {
                headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
              });
              const mediaData = await mediaRes.json();

              if (mediaData.url) {
                // Download media
                const downloadRes = await fetch(mediaData.url, {
                  headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
                });
                const buffer = Buffer.from(await downloadRes.arrayBuffer());
                const base64 = buffer.toString('base64');

                // Upload to Shopify
                await fetch(`${API_BASE}/api/product-image?action=add`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    productId,
                    base64,
                    filename: `photo_${i + 1}.jpg`
                  })
                });
                console.log(`  ✅ Photo ${i + 1} uploaded`);
              }
            } catch (photoErr) {
              console.error(`  ❌ Photo ${i + 1} failed:`, photoErr.message);
            }
          }
        }

        // Save productId to conversation context for webhook completion
        await supabase
          .from('sms_conversations')
          .update({
            context: {
              ...conv.context,
              shopify_product_id: productId,
              listing_data: data
            }
          })
          .eq('phone_number', phone);

        console.log('✅ All photos processed, productId saved to context');

      } catch (error) {
        console.error('❌ PHOTOS processing error:', error);
        // Continue anyway - webhook will handle errors
      }

      // Return same screen to trigger completion
      return {
        screen: 'PHOTOS',
        data: data
      };

    default:
      console.log('❓ Unknown screen:', screen);
      return {
        screen: 'REQUIRED_DETAILS',
        data: {}
      };
  }
}

/**
 * Handle ping action - health check from Meta
 */
function handlePing() {
  console.log('💓 Health check ping received');
  return {
    data: {
      status: 'active',
      version: '1.0'
    }
  };
}

// ============ MAIN HANDLER ============

export default async function handler(req, res) {
  // Health check via GET (for manual testing)
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      version: '1.0',
      endpoint: 'whatsapp-flow',
      encryption: 'enabled',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;

    // Validate required encryption fields
    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      console.error('❌ Missing encryption fields in request');
      return res.status(421).json({
        error: 'Missing encryption fields',
        required: ['encrypted_flow_data', 'encrypted_aes_key', 'initial_vector']
      });
    }

    // Step 1: Decrypt the AES key using RSA private key
    console.log('🔐 Decrypting AES key...');
    let aesKey;
    try {
      aesKey = decryptAesKey(encrypted_aes_key);
    } catch (e) {
      console.error('❌ AES key decryption failed:', e.message);
      return res.status(421).json({ error: 'Failed to decrypt AES key' });
    }

    // Step 2: Decrypt the flow data using AES-GCM
    console.log('🔓 Decrypting flow data...');
    let decryptedData;
    try {
      decryptedData = decryptFlowData(encrypted_flow_data, aesKey, initial_vector);
    } catch (e) {
      console.error('❌ Flow data decryption failed:', e.message);
      return res.status(421).json({ error: 'Failed to decrypt flow data' });
    }

    console.log('📥 Decrypted action:', decryptedData.action);

    // Step 3: Handle the action
    let response;
    switch (decryptedData.action) {
      case 'ping':
        response = handlePing();
        break;

      case 'INIT':
        response = await handleInit(decryptedData, aesKey);
        break;

      case 'data_exchange':
        response = await handleDataExchange(decryptedData, aesKey);
        break;

      default:
        console.log('❓ Unknown action:', decryptedData.action);
        response = {
          screen: 'REQUIRED_DETAILS',
          data: {}
        };
    }

    // Add version to response (required by WhatsApp)
    response.version = '3.0';

    // Step 4: Encrypt the response
    console.log('🔒 Encrypting response for screen:', response.screen);
    const encryptedResponse = encryptResponse(response, aesKey, initial_vector);

    // Return encrypted response as plain text
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(encryptedResponse);

  } catch (error) {
    console.error('❌ Flow endpoint error:', error);
    console.error('Stack:', error.stack);

    // Return 500 with error details for debugging
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
