// Complete WhatsApp flow test - simulates real user behavior
import fetch from 'node-fetch';
import sharp from 'sharp';
import 'dotenv/config';

const WEBHOOK_URL = 'https://sell.thephirstory.com/api/sms-webhook';
const TEST_PHONE = '+15559998888';

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

  const data = await res.json();
  console.log(`  → Response: ${JSON.stringify(data)}`);
  return data;
}

// Helper to wait
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testFullFlow() {
  console.log('🧪 FULL WHATSAPP FLOW TEST\n');
  console.log(`📱 Test Phone: ${TEST_PHONE}\n`);

  try {
    // Step 1: Start with SELL
    console.log('1️⃣  User: SELL');
    await sendWebhook('text', 'SELL');
    await sleep(1000);

    // Step 2: Send email
    console.log('\n2️⃣  User: test@example.com');
    await sendWebhook('text', 'test@example.com');
    await sleep(1000);

    // Step 3: Confirm email
    console.log('\n3️⃣  User: Click "YES ✓" button');
    await sendWebhook('interactive', 'yes');
    await sleep(1000);

    // Step 4: Send description
    console.log('\n4️⃣  User: "Khaadi kurta, small, worn once. Red with gold embroidery."');
    await sendWebhook('text', 'Khaadi kurta, small, worn once. Red with gold embroidery.');
    await sleep(2000); // AI extraction takes time

    // Step 5: Fill in missing fields
    console.log('\n5️⃣  User: Select designer "Khaadi"');
    await sendWebhook('text', 'Khaadi');
    await sleep(500);

    console.log('\n6️⃣  User: Select size "S"');
    await sendWebhook('text', 'S');
    await sleep(500);

    console.log('\n7️⃣  User: Select condition "Good"');
    await sendWebhook('text', 'Good');
    await sleep(500);

    console.log('\n8️⃣  User: Enter price "100"');
    await sendWebhook('text', '100');
    await sleep(500);

    // Step 6: Skip additional details
    console.log('\n9️⃣  User: Skip additional details');
    await sendWebhook('interactive', 'skip_details');
    await sleep(2000); // Draft creation happens here

    // Step 7: Send 3 photos AT ONCE (burst upload)
    console.log('\n🔟 User: Sends 3 photos AT ONCE (burst)\n');

    // Create 3 test photos in parallel
    const createPhoto = async (num) => {
      const buffer = await sharp({
        create: {
          width: 800,
          height: 800,
          channels: 3,
          background: { r: num * 50, g: 100, b: 200 - num * 30 }
        }
      })
      .jpeg({ quality: 85 })
      .toBuffer();
      return buffer.toString('base64');
    };

    console.log('   Creating 3 test photos...');
    const [photo1, photo2, photo3] = await Promise.all([
      createPhoto(1),
      createPhoto(2),
      createPhoto(3)
    ]);

    console.log('   Uploading 3 photos in parallel (simulating burst)...\n');
    const startTime = Date.now();

    // Send all 3 photos at once (parallel)
    const photoPromises = [
      sendWebhook('image', 'media_id_1').then(() => console.log('   ✅ Photo 1 webhook processed')),
      sendWebhook('image', 'media_id_2').then(() => console.log('   ✅ Photo 2 webhook processed')),
      sendWebhook('image', 'media_id_3').then(() => console.log('   ✅ Photo 3 webhook processed'))
    ];

    await Promise.all(photoPromises);

    const uploadTime = Date.now() - startTime;
    console.log(`\n   ⏱️  All 3 photos processed in ${(uploadTime / 1000).toFixed(1)}s\n`);

    // Wait for batch delay to complete
    console.log('   ⏸️  Waiting 10 seconds for batch processing...');
    await sleep(10000);

    // Step 8: Check session state
    console.log('\n1️⃣1️⃣  Checking session state...');

    // We can't directly check session, but we can send SUBMIT and see what happens
    console.log('\n1️⃣2️⃣  User: Click "SUBMIT ✓" button');
    const submitRes = await sendWebhook('interactive', 'submit');

    // Step 9: Analyze result
    console.log('\n📊 FINAL ANALYSIS:\n');

    if (submitRes.status === 'submitted') {
      console.log('✅ SUCCESS! Listing submitted');
      console.log('   Product ID:', submitRes.productId);
      console.log('   Listing ID:', submitRes.listingId);
      console.log('\n🎉 FULL FLOW COMPLETED SUCCESSFULLY!');
      return true;
    } else if (submitRes.status === 'error') {
      console.log('❌ SUBMISSION FAILED');
      console.log('   Error:', submitRes.error);
      if (submitRes.error?.includes('No photo URLs')) {
        console.log('\n❌ PHOTOS DID NOT SAVE - "Got 0/3 photos" bug still exists');
      }
      return false;
    } else if (submitRes.status === 'waiting for photos') {
      console.log('❌ STILL WAITING FOR PHOTOS');
      console.log('   Bot says need more photos - photos did not register');
      return false;
    } else {
      console.log('⚠️  UNEXPECTED RESPONSE');
      console.log('   Status:', submitRes.status);
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
testFullFlow().then(success => {
  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log('✅ ALL TESTS PASSED - Flow works end-to-end!');
  } else {
    console.log('❌ TEST FAILED - See errors above');
  }
  console.log('='.repeat(60));
  process.exit(success ? 0 : 1);
});
