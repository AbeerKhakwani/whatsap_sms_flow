// Test WhatsApp webhook photo handling - simulates session with photos
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const WEBHOOK_URL = 'https://sell.thephirstory.com/api/sms-webhook';
const TEST_PHONE = '+15551234567';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Generate unique message IDs
let messageCounter = Date.now();
const genMsgId = () => `test_msg_${messageCounter++}`;

// Helper to send WhatsApp webhook
async function sendWebhook(messageType, content) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test_entry',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'test_phone_id' },
          messages: [{
            from: TEST_PHONE,
            id: genMsgId(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: messageType,
            ...(messageType === 'text' ? { text: { body: content } } : {}),
            ...(messageType === 'image' ? { image: { id: content, mime_type: 'image/jpeg' } } : {}),
            ...(messageType === 'interactive' ? {
              interactive: {
                type: 'button_reply',
                button_reply: { id: content }
              }
            } : {})
          }]
        },
        field: 'messages'
      }]
    }]
  };

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return await res.json();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testPhotoHandling() {
  console.log('🧪 WEBHOOK PHOTO HANDLING TEST\n');
  console.log('Testing: Photo upload saves URLs correctly to session\n');

  try {
    // Step 1: Create a pre-configured session (bypass email verification)
    console.log('1️⃣  Creating pre-configured session...');

    // Create draft product first
    const draftRes = await fetch('https://sell.thephirstory.com/api/create-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        phone: TEST_PHONE,
        description: 'Test webhook photo handling',
        extracted: {
          designer: 'Test Brand',
          item_type: 'Kurta',
          size: 'M',
          condition: 'Good',
          asking_price: 100
        }
      })
    });

    const draftData = await draftRes.json();
    if (!draftData.success) {
      console.error('❌ Draft creation failed');
      return false;
    }

    console.log(`✅ Draft created: ${draftData.productId}`);

    // Manually insert session into Supabase
    const session = {
      state: 'collecting_photos',
      email: 'test@example.com',
      listing: {
        designer: 'Test Brand',
        item_type: 'Kurta',
        pieces_included: 'Kurta',
        size: 'M',
        condition: 'Good',
        asking_price_usd: '100',
        _seller_id: 1,
        _seller_name: 'Test Seller'
      },
      shopify_product_id: draftData.productId,
      photos: [],
      created_at: new Date().toISOString()
    };

    await supabase
      .from('whatsapp_sessions')
      .upsert({
        phone: TEST_PHONE,
        session: session,
        updated_at: new Date().toISOString()
      });

    console.log('✅ Session configured in state: collecting_photos\n');

    // Step 2: Send 3 photo webhooks rapidly (burst)
    console.log('2️⃣  Sending 3 photo webhooks in burst...\n');

    const promises = [
      sendWebhook('image', 'media_id_1'),
      sendWebhook('image', 'media_id_2'),
      sendWebhook('image', 'media_id_3')
    ];

    const results = await Promise.all(promises);
    console.log('   All 3 webhooks sent in parallel');
    results.forEach((r, i) => {
      console.log(`   Photo ${i + 1} response:`, r.status);
    });

    // Step 3: Wait for processing
    console.log('\n3️⃣  Waiting 5 seconds for processing...');
    await sleep(5000);

    // Step 4: Check session in database
    console.log('\n4️⃣  Checking session in database...');
    const { data: sessionData } = await supabase
      .from('whatsapp_sessions')
      .select('session')
      .eq('phone', TEST_PHONE)
      .single();

    const savedSession = sessionData?.session;
    const photoUrls = (savedSession?.photos || [])
      .filter(p => p.imageUrl)
      .map(p => p.imageUrl);

    console.log('\n📊 RESULTS:\n');
    console.log(`   Session state: ${savedSession?.state}`);
    console.log(`   Photos in session: ${savedSession?.photos?.length || 0}`);
    console.log(`   Photos with URLs: ${photoUrls.length}`);

    if (photoUrls.length > 0) {
      console.log('\n   Photo URLs:');
      photoUrls.forEach((url, i) => {
        console.log(`   ${i + 1}. ${url.substring(0, 60)}...`);
      });
    }

    // Step 5: Verify result
    if (photoUrls.length === 3) {
      console.log('\n✅ SUCCESS! All 3 photo URLs saved to session');
      console.log('   Burst photo upload is working correctly\n');
      return true;
    } else if (photoUrls.length > 0) {
      console.log(`\n⚠️  PARTIAL SUCCESS: Only ${photoUrls.length}/3 URLs saved`);
      console.log('   Some photos may have failed or race condition occurred\n');
      return false;
    } else {
      console.log('\n❌ FAILED: No photo URLs saved to session');
      console.log('   Photos did not save - "Got 0/3 photos" bug still exists\n');
      return false;
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
    return false;
  }
}

// Run test
testPhotoHandling().then(success => {
  console.log('='.repeat(60));
  if (success) {
    console.log('✅ WEBHOOK PHOTO HANDLING TEST PASSED');
  } else {
    console.log('❌ WEBHOOK PHOTO HANDLING TEST FAILED');
  }
  console.log('='.repeat(60));
  process.exit(success ? 0 : 1);
});
