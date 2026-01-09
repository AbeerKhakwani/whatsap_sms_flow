// Test with a larger, more realistic photo (like WhatsApp would send)
import fetch from 'node-fetch';
import sharp from 'sharp';
import 'dotenv/config';

const API_BASE = process.env.API_BASE || 'https://sell.thephirstory.com';

async function testLargePhoto() {
  console.log('🧪 Testing with Large Photo (simulating WhatsApp)\n');

  // Create a realistic 1600x1600 JPEG (similar to what sharp produces)
  const largeImageBuffer = await sharp({
    create: {
      width: 1600,
      height: 1600,
      channels: 3,
      background: { r: 100, g: 150, b: 200 }
    }
  })
  .jpeg({ quality: 85 })
  .toBuffer();

  const base64 = largeImageBuffer.toString('base64');
  const sizeKB = Math.round(base64.length / 1024);
  console.log(`📏 Image size: ${base64.length} bytes (${sizeKB}KB)`);

  // Create draft
  console.log('\n📦 Creating draft product...');
  const draftRes = await fetch(`${API_BASE}/api/create-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test-large@example.com',
      phone: '+15551234999',
      description: 'Test with large photo',
      extracted: {
        designer: 'Test Large',
        item_type: 'Kurta',
        size: 'L',
        condition: 'Good',
        asking_price: 100
      }
    })
  });

  const draftData = await draftRes.json();
  console.log(`✅ Draft created: ${draftData.productId}`);

  // Upload large photo
  console.log('\n📸 Uploading large photo...');
  const startTime = Date.now();

  const photoRes = await fetch(`${API_BASE}/api/wa-product-image?action=add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: draftData.productId,
      base64: base64,
      filename: 'large_photo.jpg'
    })
  });

  const photoData = await photoRes.json();
  const uploadTime = Date.now() - startTime;

  console.log(`⏱️  Upload took ${(uploadTime / 1000).toFixed(1)}s`);
  console.log('\n📊 Response:');
  console.log(JSON.stringify(photoData, null, 2));

  if (photoData.success && photoData.imageUrl) {
    console.log('\n✅ Large photo upload successful!');
    console.log('Image URL:', photoData.imageUrl);
  } else {
    console.log('\n❌ Large photo upload failed!');
    console.log('success:', photoData.success);
    console.log('imageUrl:', photoData.imageUrl);
  }
}

testLargePhoto().catch(console.error);
