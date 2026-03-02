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
import { supabase } from '../lib/supabase-admin.js';

const PRIVATE_KEY = process.env.WHATSAPP_PRIVATE_KEY?.replace(/\\n/g, '\n');

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
 * Handle INIT action - return initial screen with pre-filled data.
 * The Supabase lookup is best-effort with a 3s timeout — if it's slow
 * we return an empty form rather than letting Meta's 10s deadline pass.
 */
async function handleInit(decryptedData) {
  const { flow_token } = decryptedData;
  console.log('🚀 INIT with flow_token:', flow_token);

  const emptyForm = {
    brand: '', pieces: '', size: '', condition: '', price: '',
    chest: '', hip: '', color: '', fabric: '', notes: ''
  };

  // flow_token format: "prefill_{phone}_{timestamp}" or "fresh_{phone}"
  if (!flow_token?.startsWith('prefill_')) {
    return { screen: 'REQUIRED_DETAILS', data: emptyForm };
  }

  // Extract phone: strip "prefill_" prefix and optional "_timestamp" suffix
  let phone = flow_token.replace('prefill_', '').replace(/_\d+$/, '');
  if (!phone.startsWith('+')) phone = '+' + phone;

  // Best-effort prefill with 3s timeout — never block the flow
  try {
    const dbStart = Date.now();
    const result = await Promise.race([
      supabase.from('sms_conversations').select('context').eq('phone_number', phone).single(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 3000))
    ]);
    console.log(`📋 DB lookup: ${Date.now() - dbStart}ms`);

    const extracted = result.data?.context?.extracted_data;
    if (extracted) {
      console.log('✅ Pre-filling form');
      return {
        screen: 'REQUIRED_DETAILS',
        data: {
          brand: extracted.designer || '', pieces: extracted.pieces || '',
          size: extracted.size || '', condition: extracted.condition || '',
          price: extracted.asking_price?.toString() || '',
          chest: extracted.chest?.toString() || '', hip: extracted.hip?.toString() || '',
          color: extracted.color || '', fabric: extracted.fabric || '',
          notes: extracted.notes || ''
        }
      };
    }
    console.log('⚠️ No extracted_data in context');
  } catch (e) {
    console.log(`⚠️ Prefill skipped: ${e.message} — returning empty form`);
  }

  return { screen: 'REQUIRED_DETAILS', data: emptyForm };
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
      // PHOTOS screen is terminal with "complete" action
      // This case should rarely be hit - photos are handled via nfm_reply in webhook
      console.log('📸 PHOTOS screen data_exchange (unexpected)');
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

  const t0 = Date.now();
  const ms = () => `${Date.now() - t0}ms`;

  try {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;

    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      console.error(`❌ Missing encryption fields [${ms()}]`);
      return res.status(421).json({
        error: 'Missing encryption fields',
        required: ['encrypted_flow_data', 'encrypted_aes_key', 'initial_vector']
      });
    }

    // Step 1: Decrypt AES key (RSA-OAEP)
    let aesKey;
    try {
      aesKey = decryptAesKey(encrypted_aes_key);
      console.log(`🔐 AES key decrypted [${ms()}]`);
    } catch (e) {
      console.error(`❌ AES key decryption failed [${ms()}]:`, e.message);
      return res.status(421).json({ error: 'Failed to decrypt AES key' });
    }

    // Step 2: Decrypt flow data (AES-GCM)
    let decryptedData;
    try {
      decryptedData = decryptFlowData(encrypted_flow_data, aesKey, initial_vector);
      console.log(`🔓 Decrypted action: ${decryptedData.action} [${ms()}]`);
    } catch (e) {
      console.error(`❌ Flow data decryption failed [${ms()}]:`, e.message);
      return res.status(421).json({ error: 'Failed to decrypt flow data' });
    }

    // Step 3: Handle the action
    let response;
    switch (decryptedData.action) {
      case 'ping':
        response = handlePing();
        break;
      case 'INIT':
        response = await handleInit(decryptedData);
        break;
      case 'data_exchange':
        response = await handleDataExchange(decryptedData, aesKey);
        break;
      default:
        console.log(`❓ Unknown action: ${decryptedData.action} [${ms()}]`);
        response = { screen: 'REQUIRED_DETAILS', data: {} };
    }
    console.log(`📋 Handler done [${ms()}]`);

    // Step 4: Encrypt + respond
    response.version = '3.0';
    const encryptedResponse = encryptResponse(response, aesKey, initial_vector);
    console.log(`✅ Response encrypted & sent [${ms()}] screen=${response.screen}`);

    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(encryptedResponse);

  } catch (error) {
    console.error(`❌ Flow endpoint error [${ms()}]:`, error.message);
    console.error('Stack:', error.stack);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
