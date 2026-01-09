// Test photo burst upload - simulates user sending 3 photos quickly
import fetch from 'node-fetch';
import sharp from 'sharp';
import 'dotenv/config';

const API_BASE = 'https://sell.thephirstory.com';

async function testPhotoBurst() {
  console.log('🧪 PHOTO BURST UPLOAD TEST\n');
  console.log('Simulating: User sends 3 photos within 2 seconds (burst)\n');

  // Step 1: Create a draft product first
  console.log('📦 Step 1: Creating draft product...');
  const draftRes = await fetch(`${API_BASE}/api/create-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'burst-test@example.com',
      phone: '+15559999999',
      description: 'Testing photo burst upload',
      extracted: {
        designer: 'Khaadi',
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

  console.log(`✅ Draft created: ${draftData.productId}\n`);

  // Step 2: Create 3 different test photos
  console.log('📸 Step 2: Creating 3 test photos...');

  const createPhoto = async (num) => {
    const buffer = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: {
          r: num === 1 ? 255 : 100,
          g: num === 2 ? 255 : 100,
          b: num === 3 ? 255 : 100
        }
      }
    })
    .jpeg({ quality: 85 })
    .toBuffer();

    const base64 = buffer.toString('base64');
    const sizeKB = Math.round(base64.length / 1024);
    console.log(`   Photo ${num}: ${sizeKB}KB`);
    return base64;
  };

  const [photo1, photo2, photo3] = await Promise.all([
    createPhoto(1),
    createPhoto(2),
    createPhoto(3)
  ]);

  console.log('✅ 3 photos created\n');

  // Step 3: Upload all 3 photos AT ONCE (burst)
  console.log('📤 Step 3: Uploading 3 photos simultaneously...\n');

  const startTime = Date.now();

  const upload = async (photoNum, base64) => {
    const uploadStart = Date.now();
    console.log(`   🚀 Photo ${photoNum}: Starting upload...`);

    const res = await fetch(`${API_BASE}/api/wa-product-image?action=add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: draftData.productId,
        base64: base64,
        filename: `burst_photo_${photoNum}.jpg`
      })
    });

    const data = await res.json();
    const uploadTime = Date.now() - uploadStart;

    if (data.success && data.imageUrl) {
      console.log(`   ✅ Photo ${photoNum}: SUCCESS (${(uploadTime / 1000).toFixed(1)}s)`);
      console.log(`      URL: ${data.imageUrl.substring(0, 60)}...`);
      return { success: true, url: data.imageUrl, time: uploadTime };
    } else {
      console.log(`   ❌ Photo ${photoNum}: FAILED (${(uploadTime / 1000).toFixed(1)}s)`);
      console.log(`      Error: ${data.error || 'No URL returned'}`);
      return { success: false, error: data.error, time: uploadTime };
    }
  };

  // Upload all 3 in parallel (burst)
  const results = await Promise.all([
    upload(1, photo1),
    upload(2, photo2),
    upload(3, photo3)
  ]);

  const totalTime = Date.now() - startTime;

  console.log(`\n⏱️  Total burst upload time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`   Average per photo: ${(totalTime / 3000).toFixed(1)}s\n`);

  // Step 4: Analyze results
  console.log('📊 RESULTS:\n');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`   ✅ Successful uploads: ${successCount}/3`);
  console.log(`   ❌ Failed uploads: ${failCount}/3`);

  if (successCount === 3) {
    console.log('\n🎉 ALL 3 PHOTOS UPLOADED SUCCESSFULLY!');
    console.log('   Burst upload works correctly.\n');

    // Verify photos in Shopify
    console.log('🔍 Verifying in Shopify...');
    console.log(`   Go to: https://ba42c1.myshopify.com/admin/products/${draftData.productId.toString().replace(/\D/g, '')}`);
    console.log('   Expected: 3 photos visible\n');

    return true;
  } else {
    console.log('\n❌ BURST UPLOAD FAILED');
    console.log(`   Only ${successCount}/3 photos succeeded`);

    if (failCount > 0) {
      console.log('\n   Failed photo details:');
      results.forEach((r, i) => {
        if (!r.success) {
          console.log(`   Photo ${i + 1}: ${r.error || 'Unknown error'}`);
        }
      });
    }

    return false;
  }
}

// Run test
testPhotoBurst().then(success => {
  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log('✅ BURST UPLOAD TEST PASSED');
    console.log('   All 3 photos uploaded successfully in parallel');
  } else {
    console.log('❌ BURST UPLOAD TEST FAILED');
    console.log('   Some photos did not upload');
  }
  console.log('='.repeat(60));
  process.exit(success ? 0 : 1);
});
