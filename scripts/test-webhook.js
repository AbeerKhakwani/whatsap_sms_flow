#!/usr/bin/env node
/**
 * Webhook Simulator - Tests the actual deployed API
 * Simulates WhatsApp webhook payloads
 *
 * Usage: node scripts/test-webhook.js [scenario]
 *
 * Scenarios:
 *   full     - Complete happy path
 *   voice    - Voice note simulation
 *   status   - Status question test
 *   edit     - Edit flow test
 *   cancel   - Cancel flow test
 */

const API_URL = process.env.API_URL || 'https://phirstory-dashboard.vercel.app';
const TEST_PHONE = process.env.TEST_PHONE || '15551234567';

// Create WhatsApp webhook payload
function createPayload(phone, message, type = 'text', mediaId = null) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'BUSINESS_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000000',
            phone_number_id: 'PHONE_ID'
          },
          contacts: [{ profile: { name: 'Test User' }, wa_id: phone }],
          messages: [{
            from: phone,
            id: `msg_${Date.now()}`,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type
          }]
        },
        field: 'messages'
      }]
    }]
  };

  const msg = payload.entry[0].changes[0].value.messages[0];

  if (type === 'text') {
    msg.text = { body: message };
  } else if (type === 'audio') {
    msg.audio = { id: mediaId || 'audio_123', mime_type: 'audio/ogg' };
  } else if (type === 'image') {
    msg.image = { id: mediaId || 'image_123', mime_type: 'image/jpeg', caption: message };
  }

  return payload;
}

// Send webhook to API
async function sendWebhook(payload) {
  try {
    const response = await fetch(`${API_URL}/api/sms-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

// Wait between messages
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test scenarios
const scenarios = {
  async menu() {
    console.log('\n📱 Testing: MENU command\n');
    const result = await sendWebhook(createPayload(TEST_PHONE, 'MENU'));
    console.log('Response:', result);
  },

  async full() {
    console.log('\n📱 Testing: Full sell flow\n');

    // Start with SELL
    console.log('1. Sending SELL...');
    await sendWebhook(createPayload(TEST_PHONE, 'SELL'));
    await wait(1000);

    // Send item details
    console.log('2. Sending item details...');
    await sendWebhook(createPayload(TEST_PHONE, 'Sana Safinaz kurta, medium, like new, $85'));
    await wait(1000);

    // Skip details
    console.log('3. Skipping details...');
    await sendWebhook(createPayload(TEST_PHONE, 'skip'));
    await wait(1000);

    // Would need real photo handling for photos
    console.log('4. (Photos would be sent here)');

    console.log('\n✅ Flow completed - check WhatsApp for responses');
  },

  async voice() {
    console.log('\n📱 Testing: Voice note flow\n');

    console.log('1. Starting sell...');
    await sendWebhook(createPayload(TEST_PHONE, 'sell'));
    await wait(1000);

    // Simulate voice (API will fail to download but we can see the flow)
    console.log('2. Sending voice note (will fail download but tests flow)...');
    await sendWebhook(createPayload(TEST_PHONE, '', 'audio', 'fake_audio_id'));

    console.log('\n✅ Voice test completed');
  },

  async status() {
    console.log('\n📱 Testing: Status question\n');

    console.log('1. Sending partial info...');
    await sendWebhook(createPayload(TEST_PHONE, 'Maria B kurta medium'));
    await wait(1000);

    console.log('2. Asking status...');
    await sendWebhook(createPayload(TEST_PHONE, 'what did i list so far?'));

    console.log('\n✅ Status test completed');
  },

  async reset() {
    console.log('\n📱 Resetting state with MENU...\n');
    await sendWebhook(createPayload(TEST_PHONE, 'MENU'));
    console.log('✅ Reset completed');
  },

  async cancel() {
    console.log('\n📱 Testing: Cancel flow\n');

    console.log('1. Starting sell...');
    await sendWebhook(createPayload(TEST_PHONE, 'sell'));
    await wait(1000);

    console.log('2. Adding some info...');
    await sendWebhook(createPayload(TEST_PHONE, 'Khaadi suit'));
    await wait(1000);

    console.log('3. Canceling...');
    await sendWebhook(createPayload(TEST_PHONE, 'cancel'));

    console.log('\n✅ Cancel test completed');
  },

  async all() {
    console.log('\n🧪 Running ALL tests...\n');

    await scenarios.reset();
    await wait(2000);

    await scenarios.full();
    await wait(2000);

    await scenarios.reset();
    await wait(2000);

    await scenarios.status();
    await wait(2000);

    await scenarios.reset();
    await wait(2000);

    await scenarios.cancel();

    console.log('\n✅ All tests completed!');
  }
};

// Main
const scenario = process.argv[2] || 'menu';

if (!scenarios[scenario]) {
  console.log('Available scenarios:', Object.keys(scenarios).join(', '));
  process.exit(1);
}

console.log(`\n🚀 Running scenario: ${scenario}`);
console.log(`📍 API: ${API_URL}`);
console.log(`📞 Phone: ${TEST_PHONE}`);

scenarios[scenario]().catch(console.error);
