// Test: Photo URLs save to Supabase and persist through the flow
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import sharp from 'sharp';
import 'dotenv/config';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const API_BASE = 'https://sell.thephirstory.com';
const TEST_PHONE = '+15559876543';
const TEST_EMAIL = 'photo-test@example.com';

console.log('🧪 PHOTO DATABASE PERSISTENCE TEST\n');
console.log('Testing: Shopify URLs → Supabase session → pending_listings DB\n');

async function cleanupTestData() {
  console.log('🧹 Cleaning up any existing test data...');

  // Delete test phone session
  await supabase
    .from('whatsapp_sessions')
    .delete()
    .eq('phone', TEST_PHONE);

  // Delete test seller's listings
  const { data: seller } = await supabase
    .from('sellers')
    .select('id')
    .ilike('email', TEST_EMAIL)
    .maybeSingle();

  if (seller) {
    await supabase
      .from('listings')
      .delete()
      .eq('seller_id', seller.id);
  }

  console.log('✅ Cleanup complete\n');
}

async function createTestPhoto(num) {
  const buffer = await sharp({
    create: {
      width: 800,
      height: 800,
      channels: 3,
      background: { r: num * 80, g: 150, b: 200 }
    }
  })
  .jpeg({ quality: 85 })
  .toBuffer();

  return buffer.toString('base64');
}

async function testPhotoDBPersistence() {
  try {
    await cleanupTestData();

    // Step 1: Create a draft product
    console.log('📦 Step 1: Creating draft product...');
    const draftRes = await fetch(`${API_BASE}/api/create-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        phone: TEST_PHONE,
        description: 'Testing photo DB persistence',
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
      return false;
    }

    const productId = draftData.productId;
    console.log(`✅ Draft created: ${productId}\n`);

    // Step 2: Manually create session (simulating WhatsApp flow)
    console.log('💾 Step 2: Creating session in Supabase...');
    const session = {
      state: 'collecting_photos',
      email: TEST_EMAIL,
      listing: {
        designer: 'Test Designer',
        item_type: 'Kurta',
        pieces_included: 'Kurta',
        size: 'M',
        condition: 'Good',
        asking_price_usd: '100'
      },
      shopify_product_id: productId,
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

    console.log('✅ Session created\n');

    // Step 3: Upload 3 photos to Shopify
    console.log('📸 Step 3: Uploading 3 photos to Shopify...\n');
    const photoUrls = [];

    for (let i = 1; i <= 3; i++) {
      console.log(`   Uploading photo ${i}...`);
      const base64 = await createTestPhoto(i);

      const uploadRes = await fetch(`${API_BASE}/api/wa-product-image?action=add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productId,
          base64: base64,
          filename: `test_photo_${i}.jpg`
        })
      });

      const uploadData = await uploadRes.json();

      if (uploadData.success && uploadData.imageUrl) {
        photoUrls.push(uploadData.imageUrl);
        console.log(`   ✅ Photo ${i} uploaded: ${uploadData.imageUrl.substring(0, 50)}...`);

        // Manually add to session (simulating what handlePhoto does)
        const { data: currentSession } = await supabase
          .from('whatsapp_sessions')
          .select('session')
          .eq('phone', TEST_PHONE)
          .single();

        const updatedSession = currentSession.session;
        updatedSession.photos.push({
          imageUrl: uploadData.imageUrl,
          imageId: uploadData.imageId,
          mediaId: `test_media_${i}`
        });

        await supabase
          .from('whatsapp_sessions')
          .update({
            session: updatedSession,
            updated_at: new Date().toISOString()
          })
          .eq('phone', TEST_PHONE);

      } else {
        console.log(`   ❌ Photo ${i} upload failed:`, uploadData);
        return false;
      }
    }

    console.log(`\n✅ All 3 photos uploaded to Shopify\n`);

    // Step 4: Verify photos are in Supabase session
    console.log('🔍 Step 4: Verifying photos in Supabase session...');
    const { data: sessionData } = await supabase
      .from('whatsapp_sessions')
      .select('session')
      .eq('phone', TEST_PHONE)
      .single();

    const sessionPhotos = sessionData?.session?.photos || [];
    const photosWithUrls = sessionPhotos.filter(p => p.imageUrl);

    console.log(`   Photos in session: ${sessionPhotos.length}`);
    console.log(`   Photos with URLs: ${photosWithUrls.length}`);

    if (photosWithUrls.length !== 3) {
      console.error('❌ FAIL: Expected 3 photos with URLs in session');
      console.error('   Found:', photosWithUrls);
      return false;
    }

    console.log('✅ All 3 photos stored in Supabase session\n');

    // Verify URLs match what Shopify returned
    let allMatch = true;
    for (let i = 0; i < 3; i++) {
      if (sessionPhotos[i].imageUrl !== photoUrls[i]) {
        console.error(`❌ URL mismatch for photo ${i + 1}`);
        console.error(`   Expected: ${photoUrls[i]}`);
        console.error(`   Got: ${sessionPhotos[i].imageUrl}`);
        allMatch = false;
      }
    }

    if (allMatch) {
      console.log('✅ All URLs match Shopify responses\n');
    } else {
      return false;
    }

    // Step 5: Simulate submission to pending_listings
    console.log('📤 Step 5: Simulating listing submission...');

    const { data: seller } = await supabase
      .from('sellers')
      .select('id, name')
      .ilike('email', TEST_EMAIL)
      .maybeSingle();

    if (!seller) {
      console.error('❌ Seller not found');
      return false;
    }

    // Insert into listings table (simulating what submitListing does)
    const { data: listing, error: insertError } = await supabase
      .from('listings')
      .insert({
        seller_id: seller.id,
        seller_name: seller.name || 'Test Seller',
        email: TEST_EMAIL,
        phone: TEST_PHONE,
        designer: 'Test Designer',
        item_type: 'Kurta',
        size: 'M',
        condition: 'Good',
        asking_price: 100,
        description: 'Testing photo DB persistence',
        shopify_product_id: productId,
        photo_urls: photosWithUrls.map(p => p.imageUrl), // Array of URLs
        status: 'pending',
        submission_date: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to insert listing:', insertError);
      return false;
    }

    console.log(`✅ Listing created: ID ${listing.id}\n`);

    // Step 6: Retrieve listing and verify photo URLs
    console.log('🔍 Step 6: Retrieving listing from DB...');
    const { data: retrievedListing } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listing.id)
      .single();

    const dbPhotoUrls = retrievedListing.photo_urls || [];
    console.log(`   Photo URLs in DB: ${dbPhotoUrls.length}`);

    if (dbPhotoUrls.length !== 3) {
      console.error('❌ FAIL: Expected 3 photo URLs in listings table');
      console.error('   Found:', dbPhotoUrls);
      return false;
    }

    console.log('✅ All 3 photo URLs stored in listings table\n');

    // Verify URLs are valid CDN URLs
    let allValidUrls = true;
    for (let i = 0; i < dbPhotoUrls.length; i++) {
      const url = dbPhotoUrls[i];
      if (!url.startsWith('https://cdn.shopify.com/')) {
        console.error(`❌ Invalid URL format: ${url}`);
        allValidUrls = false;
      } else {
        console.log(`   ✅ Photo ${i + 1}: Valid Shopify CDN URL`);
      }
    }

    if (!allValidUrls) {
      return false;
    }

    console.log('\n✅ All URLs are valid Shopify CDN URLs\n');

    // Step 7: Final summary
    console.log('📊 FINAL VERIFICATION:\n');
    console.log(`   ✅ Photos uploaded to Shopify: 3`);
    console.log(`   ✅ URLs saved to Supabase session: ${photosWithUrls.length}`);
    console.log(`   ✅ URLs saved to listings DB: ${dbPhotoUrls.length}`);
    console.log(`   ✅ All URLs are valid Shopify CDN URLs`);
    console.log(`   ✅ Shopify product ID saved: ${retrievedListing.shopify_product_id}`);

    console.log('\n🎉 FULL PERSISTENCE FLOW VERIFIED!\n');
    console.log('Photo journey:');
    console.log('  1. Upload → Shopify');
    console.log('  2. Get CDN URL → wa-product-image API');
    console.log('  3. Save URL → Supabase session.photos[]');
    console.log('  4. Submit → listings.photo_urls[]');
    console.log('  5. Retrieve → URLs come back correctly ✓\n');

    return true;

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
    return false;
  }
}

// Run test
testPhotoDBPersistence().then(success => {
  console.log('='.repeat(60));
  if (success) {
    console.log('✅ PHOTO DB PERSISTENCE TEST PASSED');
    console.log('   All photo URLs saved and retrieved correctly!');
  } else {
    console.log('❌ PHOTO DB PERSISTENCE TEST FAILED');
    console.log('   Check errors above');
  }
  console.log('='.repeat(60));
  process.exit(success ? 0 : 1);
});
