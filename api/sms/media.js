// api/sms/media.js
// Media handling utilities for Twilio → Supabase → OpenAI flow

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Download media from Twilio URL
 * @param {string} twilioUrl - The media URL from Twilio
 * @returns {Promise<Buffer>} - The media buffer
 */
export async function downloadTwilioMedia(twilioUrl) {
  try {
    const response = await fetch(twilioUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('❌ Failed to download Twilio media:', error);
    throw error;
  }
}

/**
 * Upload media buffer to Supabase Storage
 * @param {Buffer} buffer - The media buffer
 * @param {string} filePath - Path in Supabase storage (e.g., 'listings/seller123/photo1.jpg')
 * @param {string} contentType - MIME type (e.g., 'image/jpeg')
 * @returns {Promise<string>} - The public URL of the uploaded media
 */
export async function uploadToSupabase(buffer, filePath, contentType) {
  try {
    const { data, error } = await supabase.storage
      .from('listing-photos')
      .upload(filePath, buffer, {
        contentType,
        upsert: true
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('listing-photos')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('❌ Failed to upload to Supabase:', error);
    throw error;
  }
}

/**
 * Process media URLs from Twilio webhook
 * Downloads from Twilio, uploads to Supabase, returns Supabase URLs
 * @param {string[]} mediaUrls - Array of Twilio media URLs
 * @param {string} sellerId - Seller ID for organizing files
 * @param {string} messageSid - Twilio message SID for unique filenames
 * @returns {Promise<string[]>} - Array of Supabase public URLs
 */
export async function processMediaUrls(mediaUrls, sellerId, messageSid) {
  if (!mediaUrls || mediaUrls.length === 0) {
    return [];
  }

  const supabaseUrls = [];

  for (let i = 0; i < mediaUrls.length; i++) {
    try {
      const twilioUrl = mediaUrls[i];

      // Download from Twilio
      console.log(`📥 Downloading media ${i + 1}/${mediaUrls.length}...`);
      const buffer = await downloadTwilioMedia(twilioUrl);

      // Determine file extension and content type
      const urlParts = twilioUrl.split('.');
      const extension = urlParts[urlParts.length - 1].toLowerCase();
      const contentType = getContentType(extension);

      // Create unique filename
      const fileName = `${messageSid}_${i + 1}.${extension}`;
      const filePath = `listings/${sellerId}/${fileName}`;

      // Upload to Supabase
      console.log(`📤 Uploading to Supabase: ${filePath}`);
      const publicUrl = await uploadToSupabase(buffer, filePath, contentType);

      supabaseUrls.push(publicUrl);
    } catch (error) {
      console.error(`❌ Failed to process media ${i + 1}:`, error);
      // Continue with other media instead of failing completely
    }
  }

  return supabaseUrls;
}

/**
 * Get MIME type from file extension
 * @param {string} extension - File extension (jpg, png, etc.)
 * @returns {string} - MIME type
 */
export function getContentType(extension) {
  const types = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'ogg': 'audio/ogg',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav'
  };

  return types[extension] || 'application/octet-stream';
}