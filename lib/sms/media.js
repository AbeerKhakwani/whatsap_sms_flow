// lib/sms/media.js
// Media handling utilities for WhatsApp → Supabase flow

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Upload media buffer to Supabase Storage
 */
export async function uploadToSupabase(buffer, filePath, contentType) {
  try {
    const { data, error } = await supabase.storage
      .from('listing-photos')
      .upload(filePath, buffer, {
        contentType,
        upsert: true
      });

    if (error) throw error;

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
 * Get file extension from MIME type
 */
export function getExtensionFromContentType(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav'
  };
  return map[contentType] || 'jpg';
}

/**
 * Process media from WhatsApp Cloud API
 * Downloads media using media ID, uploads to Supabase
 */
export async function processWhatsAppMedia(mediaItems, sellerId, messageId) {
  if (!mediaItems || mediaItems.length === 0) {
    return [];
  }

  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!WHATSAPP_TOKEN) {
    console.error('❌ WhatsApp access token not configured');
    return [];
  }

  console.log(`📸 Processing ${mediaItems.length} media items for seller ${sellerId}`);

  const supabaseUrls = [];

  for (let i = 0; i < mediaItems.length; i++) {
    try {
      const media = mediaItems[i];

      // Get media URL from WhatsApp API
      const mediaInfoResponse = await fetch(
        `https://graph.facebook.com/v18.0/${media.id}`,
        { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } }
      );

      if (!mediaInfoResponse.ok) {
        throw new Error(`Failed to get media info: ${mediaInfoResponse.status}`);
      }

      const mediaInfo = await mediaInfoResponse.json();

      // Download the actual media
      const mediaResponse = await fetch(mediaInfo.url, {
        headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
      });

      if (!mediaResponse.ok) {
        throw new Error(`Failed to download media: ${mediaResponse.status}`);
      }

      const arrayBuffer = await mediaResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = media.mime || 'image/jpeg';
      const extension = getExtensionFromContentType(contentType);

      // Upload to Supabase
      const fileName = `${messageId}_${i + 1}.${extension}`;
      const filePath = `listings/${sellerId}/${fileName}`;
      const publicUrl = await uploadToSupabase(buffer, filePath, contentType);

      supabaseUrls.push(publicUrl);
    } catch (error) {
      console.error(`❌ Failed to process WhatsApp media ${i + 1}:`, error);
    }
  }

  return supabaseUrls;
}
