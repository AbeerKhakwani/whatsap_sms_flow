/**
 * SMS Database Operations
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ===== SELLER OPERATIONS =====

export async function findSellerByPhone(phone) {
  if (!phone) return null;

  // Try multiple phone formats
  const digits = phone.replace(/\D/g, ''); // Remove all non-digits
  const formats = [
    phone,                              // +15034423865 (as-is)
    digits,                             // 15034423865
    digits.slice(-10),                  // 5034423865 (last 10 digits)
    '+' + digits,                       // +15034423865
    '+1' + digits.slice(-10),           // +15034423865
  ];

  // Remove duplicates and empty strings
  const uniqueFormats = [...new Set(formats)].filter(f => f && f.length > 0);

  const { data } = await supabase
    .from('sellers')
    .select('*')
    .in('phone', uniqueFormats)
    .maybeSingle();
  return data;
}

export async function findSellerByEmail(email) {
  const normalized = email.toLowerCase().trim();

  // Try email first
  let { data } = await supabase
    .from('sellers')
    .select('*')
    .ilike('email', normalized)
    .maybeSingle();

  if (data) return data;

  // Try paypal_email
  ({ data } = await supabase
    .from('sellers')
    .select('*')
    .ilike('paypal_email', normalized)
    .maybeSingle());

  return data;
}

export async function createSeller({ phone, email }) {
  const { data } = await supabase
    .from('sellers')
    .insert({
      phone,
      email: email.toLowerCase().trim(),
      name: email.split('@')[0]
    })
    .select()
    .single();
  return data;
}

export async function linkPhoneToSeller(sellerId, phone) {
  const { data } = await supabase
    .from('sellers')
    .update({ phone })
    .eq('id', sellerId)
    .select()
    .single();
  return data;
}

// ===== CONVERSATION OPERATIONS =====

export async function findConversation(phone) {
  const { data } = await supabase
    .from('sms_conversations')
    .select('*')
    .eq('phone_number', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function createConversation(phone, sellerId = null) {
  const { data } = await supabase
    .from('sms_conversations')
    .insert({
      phone_number: phone,
      seller_id: sellerId,
      state: 'new',
      is_authorized: false,
      context: {}
    })
    .select()
    .single();
  return data;
}

export async function updateConversation(id, updates) {
  const { data } = await supabase
    .from('sms_conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return data;
}

export async function setState(id, state, context = {}) {
  return updateConversation(id, { state, context });
}

export async function authorize(id, sellerId) {
  return updateConversation(id, {
    state: 'authorized',
    is_authorized: true,
    seller_id: sellerId,
    authorized_at: new Date().toISOString(),
    auth_attempts: 0,
    context: {}
  });
}

/**
 * Check if session has expired (30 days of inactivity)
 */
export function isSessionExpired(conv, maxDays = 30) {
  if (!conv.is_authorized || !conv.authorized_at) return true;

  const authorizedAt = new Date(conv.authorized_at);
  const now = new Date();
  const daysSinceAuth = (now - authorizedAt) / (1000 * 60 * 60 * 24);

  return daysSinceAuth > maxDays;
}

/**
 * Revoke authorization (logout)
 */
export async function revokeAuth(id) {
  return updateConversation(id, {
    is_authorized: false,
    authorized_at: null,
    context: {}
  });
}

/**
 * Revoke all other conversations for a seller (when new phone authorizes)
 */
export async function revokeOtherSessions(sellerId, currentConvId) {
  const { data } = await supabase
    .from('sms_conversations')
    .update({
      is_authorized: false,
      authorized_at: null
    })
    .eq('seller_id', sellerId)
    .neq('id', currentConvId)
    .eq('is_authorized', true);

  return data;
}

/**
 * Track auth attempt for rate limiting
 */
export async function trackAuthAttempt(id) {
  const { data: conv } = await supabase
    .from('sms_conversations')
    .select('auth_attempts, last_auth_attempt')
    .eq('id', id)
    .single();

  const now = new Date();
  const lastAttempt = conv?.last_auth_attempt ? new Date(conv.last_auth_attempt) : null;
  const hoursSinceLastAttempt = lastAttempt ? (now - lastAttempt) / (1000 * 60 * 60) : 999;

  // Reset counter if more than 1 hour since last attempt
  const newAttempts = hoursSinceLastAttempt > 1 ? 1 : (conv?.auth_attempts || 0) + 1;

  await updateConversation(id, {
    auth_attempts: newAttempts,
    last_auth_attempt: now.toISOString()
  });

  return newAttempts;
}

/**
 * Check if rate limited (max 10 attempts per hour)
 */
export async function isRateLimited(id, maxAttempts = 10) {
  const { data: conv } = await supabase
    .from('sms_conversations')
    .select('auth_attempts, last_auth_attempt')
    .eq('id', id)
    .single();

  if (!conv) return false;

  const now = new Date();
  const lastAttempt = conv.last_auth_attempt ? new Date(conv.last_auth_attempt) : null;
  const hoursSinceLastAttempt = lastAttempt ? (now - lastAttempt) / (1000 * 60 * 60) : 999;

  // Reset if more than 1 hour
  if (hoursSinceLastAttempt > 1) return false;

  return conv.auth_attempts >= maxAttempts;
}


// ===== LISTINGS OPERATIONS =====

/**
 * Find draft listing for a seller
 */
export async function findDraftListing(sellerId) {
  const { data } = await supabase
    .from('listings')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Create a new draft listing
 */
export async function createListing(sellerId, convId, inputMethod = null) {
  const { data } = await supabase
    .from('listings')
    .insert({
      seller_id: sellerId,
      conversation_id: convId,
      status: 'draft',
      input_method: inputMethod
    })
    .select()
    .single();
  return data;
}

/**
 * Update listing fields
 */
export async function updateListing(listingId, updates) {
  const { data } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', listingId)
    .select()
    .single();
  return data;
}

/**
 * Delete a listing
 */
export async function deleteListing(listingId) {
  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', listingId);
  return !error;
}

/**
 * Get listing by ID
 */
export async function getListing(listingId) {
  const { data } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .single();
  return data;
}

/**
 * Add photo URL to listing
 */
export async function addPhotoToListing(listingId, photoUrl, isTagPhoto = false) {
  const listing = await getListing(listingId);
  if (!listing) return null;

  if (isTagPhoto) {
    return updateListing(listingId, { photo_tag_url: photoUrl });
  }

  const currentPhotos = listing.photo_urls || [];
  return updateListing(listingId, {
    photo_urls: [...currentPhotos, photoUrl]
  });
}

/**
 * Check if listing has required fields
 */
export function getListingMissingFields(listing) {
  const required = ['designer', 'item_type', 'size', 'condition', 'asking_price_usd'];
  return required.filter(field => !listing[field]);
}

/**
 * Check if listing has required photos (1 tag + 3 item)
 */
export function getListingMissingPhotos(listing) {
  const missing = [];
  if (!listing.photo_tag_url) missing.push('tag');
  const itemPhotos = listing.photo_urls?.length || 0;
  if (itemPhotos < 3) missing.push(`${3 - itemPhotos} more item photo(s)`);
  return missing;
}

/**
 * Check if listing is ready for submission
 */
export function isListingComplete(listing) {
  const missingFields = getListingMissingFields(listing);
  const missingPhotos = getListingMissingPhotos(listing);
  return missingFields.length === 0 && missingPhotos.length === 0;
}

export { supabase };
