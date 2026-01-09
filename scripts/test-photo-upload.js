// Test photo upload flow end-to-end
import fetch from 'node-fetch';
import 'dotenv/config';

const API_BASE = process.env.API_BASE || 'https://sell.thephirstory.com';

// Small 1x1 red pixel PNG in base64
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function testPhotoUpload() {
  console.log('🧪 Testing WhatsApp Photo Upload Flow\n');

  // Step 1: Create a draft product
  console.log('📦 Step 1: Creating draft product...');
  const draftRes = await fetch(`${API_BASE}/api/create-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      phone: '+15551234567',
      description: 'Test kurta for photo upload testing',
      extracted: {
        designer: 'Test Designer',
        item_type: 'Kurta',
        size: 'M',
        condition: 'Good',
        asking_price: 100
      }
    })
  });

  const draftData = await draftRes.json();

  if (!draftData.success) {
    console.error('❌ Draft creation failed:', draftData);
    return;
  }

  console.log(`✅ Draft created: ${draftData.productId}\n`);

  // Step 2: Upload photo to draft
  console.log('📸 Step 2: Uploading photo to draft...');
  const startTime = Date.now();

  const photoRes = await fetch(`${API_BASE}/api/wa-product-image?action=add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: draftData.productId,
      base64: TEST_IMAGE_BASE64,
      filename: 'test_photo.jpg'
    })
  });

  const photoData = await photoRes.json();
  const uploadTime = Date.now() - startTime;

  console.log(`⏱️  Upload took ${uploadTime}ms\n`);

  // Step 3: Analyze response
  console.log('📊 Step 3: Analyzing response...');
  console.log('Response:', JSON.stringify(photoData, null, 2));

  if (!photoData.success) {
    console.error('\n❌ Upload failed!');
    console.error('Error:', photoData.error || photoData.details);
    return;
  }

  // Check URL
  if (!photoData.imageUrl) {
    console.error('\n❌ No imageUrl returned!');
    console.error('imageId:', photoData.imageId);
    console.error('debug:', photoData.debug);
    return;
  }

  console.log('\n✅ Upload successful!');
  console.log('Image ID:', photoData.imageId);
  console.log('Image URL:', photoData.imageUrl);
  console.log('URL is valid:', photoData.imageUrl.startsWith('https://'));

  // Step 4: Verify URL is accessible
  console.log('\n🔍 Step 4: Verifying CDN URL is accessible...');
  try {
    const urlCheck = await fetch(photoData.imageUrl, { method: 'HEAD' });
    if (urlCheck.ok) {
      console.log('✅ CDN URL is accessible (HTTP', urlCheck.status, ')');
    } else {
      console.log('⚠️  CDN URL returned HTTP', urlCheck.status);
    }
  } catch (err) {
    console.error('❌ CDN URL check failed:', err.message);
  }

  // Step 5: Verify photo appears in Shopify admin
  console.log('\n🛍️  Step 5: Check Shopify admin for the photo');
  console.log('Product ID:', draftData.productId);
  console.log('Go to: https://ba42c1.myshopify.com/admin/products/' + draftData.productId.replace(/\D/g, ''));

  console.log('\n✅ Test completed!');
}

testPhotoUpload().catch(console.error);
