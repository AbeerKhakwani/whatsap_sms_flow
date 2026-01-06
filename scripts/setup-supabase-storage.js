// scripts/setup-supabase-storage.js
// Run this once to set up your Supabase storage bucket for listing media

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setupStorage() {
  try {
    console.log('🔧 Setting up Supabase storage bucket...');

    // Create the bucket if it doesn't exist
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('❌ Failed to list buckets:', listError);
      return;
    }

    const bucketExists = buckets.some(bucket => bucket.name === 'listing-photos');

    if (!bucketExists) {
      console.log('📦 Creating bucket "listing-photos"...');
      const { error: createError } = await supabase.storage.createBucket('listing-photos', {
        public: true, // Make it public so we can get public URLs
        allowedMimeTypes: ['image/*', 'video/*', 'audio/*'],
        fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
      });

      if (createError) {
        console.error('❌ Failed to create bucket:', createError);
        return;
      }

      console.log('✅ Bucket created successfully!');
    } else {
      console.log('✅ Bucket "listing-media" already exists');
    }

    // Set up bucket policy (allow public read access)
    console.log('🔒 Setting up bucket policies...');

    // Note: You might need to set up RLS policies in Supabase dashboard
    // For now, we'll use public bucket which allows anonymous reads

    console.log('✅ Storage setup complete!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. In Supabase dashboard → Storage → listing-photos');
    console.log('2. Make sure bucket is set to "Public"');
    console.log('3. Add these environment variables to your deployment:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_SERVICE_KEY');
    console.log('   - WHATSAPP_ACCESS_TOKEN');
    console.log('   - WHATSAPP_PHONE_NUMBER_ID');
    console.log('   - WHATSAPP_VERIFY_TOKEN');
    console.log('   - OPENAI_API_KEY');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupStorage();