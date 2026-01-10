/**
 * Database operations for sms_conversations table
 *
 * Handles conversation state management, authorization, and context storage.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Normalize phone number to E.164 format
 *
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized phone (e.g., "+15551234567")
 */
export function normalizePhone(phone) {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Add + prefix if missing
  if (!phone.startsWith('+')) {
    return `+${digits}`;
  }

  return phone;
}

/**
 * Find or create conversation by phone number
 *
 * @param {string} phone - Phone number
 * @returns {Promise<object>} - Conversation record
 */
export async function findOrCreateConversation(phone) {
  const normalizedPhone = normalizePhone(phone);

  // Try to find existing conversation
  const { data: existing, error: findError } = await supabase
    .from('sms_conversations')
    .select('*')
    .eq('phone_number', normalizedPhone)
    .single();

  if (existing) {
    console.log(`📞 Found existing conversation for ${normalizedPhone}`);
    return existing;
  }

  // Create new conversation
  const { data: newConv, error: createError } = await supabase
    .from('sms_conversations')
    .insert({
      phone_number: normalizedPhone,
      state: 'new',
      context: {},
      is_authorized: false
    })
    .select()
    .single();

  if (createError) {
    console.error('❌ Error creating conversation:', createError);
    throw createError;
  }

  console.log(`✅ Created new conversation for ${normalizedPhone}`);
  return newConv;
}

/**
 * Get conversation by phone number
 *
 * @param {string} phone - Phone number
 * @returns {Promise<object|null>} - Conversation record or null
 */
export async function getConversation(phone) {
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from('sms_conversations')
    .select('*')
    .eq('phone_number', normalizedPhone)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('❌ Error getting conversation:', error);
    throw error;
  }

  return data;
}

/**
 * Update conversation state
 *
 * @param {string} phone - Phone number
 * @param {string} newState - New state
 * @returns {Promise<object>} - Updated conversation
 */
export async function setState(phone, newState) {
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from('sms_conversations')
    .update({
      state: newState,
      updated_at: new Date().toISOString()
    })
    .eq('phone_number', normalizedPhone)
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating state:', error);
    throw error;
  }

  console.log(`🔄 State updated for ${normalizedPhone}: ${newState}`);
  return data;
}

/**
 * Update conversation context (merge with existing)
 *
 * @param {string} phone - Phone number
 * @param {object} contextUpdate - Context fields to update
 * @returns {Promise<object>} - Updated conversation
 */
export async function updateContext(phone, contextUpdate) {
  const normalizedPhone = normalizePhone(phone);

  // Get current context
  const current = await getConversation(normalizedPhone);
  if (!current) {
    throw new Error('Conversation not found');
  }

  // Merge context
  const newContext = {
    ...current.context,
    ...contextUpdate
  };

  const { data, error } = await supabase
    .from('sms_conversations')
    .update({
      context: newContext,
      updated_at: new Date().toISOString()
    })
    .eq('phone_number', normalizedPhone)
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating context:', error);
    throw error;
  }

  return data;
}

/**
 * Authorize conversation after email verification
 *
 * @param {string} phone - Phone number
 * @param {number} sellerId - Seller ID from sellers table
 * @param {string} email - Verified email
 * @returns {Promise<object>} - Updated conversation
 */
export async function authorize(phone, sellerId, email) {
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from('sms_conversations')
    .update({
      is_authorized: true,
      seller_id: sellerId,
      authorized_at: new Date().toISOString(),
      state: 'authorized',
      context: {
        email,
        listing_data: {},
        shopify_file_ids: [],
        processed_messages: []
      },
      updated_at: new Date().toISOString()
    })
    .eq('phone_number', normalizedPhone)
    .select()
    .single();

  if (error) {
    console.error('❌ Error authorizing conversation:', error);
    throw error;
  }

  console.log(`✅ Authorized ${normalizedPhone} as seller ${sellerId}`);
  return data;
}

/**
 * Revoke authorization (logout)
 *
 * @param {string} phone - Phone number
 * @returns {Promise<object>} - Updated conversation
 */
export async function revokeAuth(phone) {
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from('sms_conversations')
    .update({
      is_authorized: false,
      seller_id: null,
      authorized_at: null,
      state: 'new',
      context: {},
      updated_at: new Date().toISOString()
    })
    .eq('phone_number', normalizedPhone)
    .select()
    .single();

  if (error) {
    console.error('❌ Error revoking auth:', error);
    throw error;
  }

  console.log(`🚪 Revoked auth for ${normalizedPhone}`);
  return data;
}

/**
 * Reset conversation (start fresh sell flow)
 *
 * @param {string} phone - Phone number
 * @returns {Promise<object>} - Updated conversation
 */
export async function resetConversation(phone) {
  const normalizedPhone = normalizePhone(phone);

  // Get current conversation to preserve seller_id and authorization
  const current = await getConversation(normalizedPhone);
  if (!current) {
    throw new Error('Conversation not found');
  }

  const { data, error } = await supabase
    .from('sms_conversations')
    .update({
      state: 'authorized',
      context: {
        email: current.context?.email || '',
        listing_data: {},
        shopify_file_ids: [],
        processed_messages: current.context?.processed_messages || []
      },
      updated_at: new Date().toISOString()
    })
    .eq('phone_number', normalizedPhone)
    .select()
    .single();

  if (error) {
    console.error('❌ Error resetting conversation:', error);
    throw error;
  }

  console.log(`🔄 Reset conversation for ${normalizedPhone}`);
  return data;
}

/**
 * Find seller by phone number
 *
 * @param {string} phone - Phone number
 * @returns {Promise<object|null>} - Seller record or null
 */
export async function findSellerByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .eq('phone', normalizedPhone)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('❌ Error finding seller by phone:', error);
    throw error;
  }

  return data;
}

/**
 * Find seller by email
 *
 * @param {string} email - Email address
 * @returns {Promise<object|null>} - Seller record or null
 */
export async function findSellerByEmail(email) {
  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('❌ Error finding seller by email:', error);
    throw error;
  }

  return data;
}

/**
 * Create new seller
 *
 * @param {object} sellerData - { phone, email, name }
 * @returns {Promise<object>} - Created seller record
 */
export async function createSeller(sellerData) {
  const normalizedPhone = normalizePhone(sellerData.phone);

  const { data, error } = await supabase
    .from('sellers')
    .insert({
      phone: normalizedPhone,
      email: sellerData.email.toLowerCase(),
      name: sellerData.name || null
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating seller:', error);
    throw error;
  }

  console.log(`✅ Created seller ${data.id} for ${sellerData.email}`);
  return data;
}

/**
 * Update seller's phone number
 *
 * @param {string} sellerId - Seller UUID
 * @param {string} phone - New phone number
 * @returns {Promise<object>} - Updated seller record
 */
export async function updateSellerPhone(sellerId, phone) {
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from('sellers')
    .update({ phone: normalizedPhone })
    .eq('id', sellerId)
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating seller phone:', error);
    throw error;
  }

  console.log(`✅ Updated phone for seller ${sellerId} to ${normalizedPhone}`);
  return data;
}

/**
 * Increment auth attempts
 *
 * @param {string} phone - Phone number
 * @returns {Promise<number>} - New attempt count
 */
export async function incrementAuthAttempts(phone) {
  const normalizedPhone = normalizePhone(phone);

  const current = await getConversation(normalizedPhone);
  const newCount = (current.auth_attempts || 0) + 1;

  const { data, error } = await supabase
    .from('sms_conversations')
    .update({
      auth_attempts: newCount,
      last_auth_attempt: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('phone_number', normalizedPhone)
    .select()
    .single();

  if (error) {
    console.error('❌ Error incrementing auth attempts:', error);
    throw error;
  }

  return newCount;
}

/**
 * Check if message has been processed (deduplication)
 *
 * @param {string} phone - Phone number
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<boolean>} - True if already processed
 */
export async function isMessageProcessed(phone, messageId) {
  const normalizedPhone = normalizePhone(phone);

  const conv = await getConversation(normalizedPhone);
  if (!conv) return false;

  const processed = conv.context?.processed_messages || [];
  return processed.includes(messageId);
}

/**
 * Mark message as processed
 *
 * @param {string} phone - Phone number
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<void>}
 */
export async function markMessageProcessed(phone, messageId) {
  const normalizedPhone = normalizePhone(phone);

  const conv = await getConversation(normalizedPhone);
  if (!conv) {
    throw new Error('Conversation not found');
  }

  const processed = conv.context?.processed_messages || [];

  // Only keep last 100 message IDs to prevent context from growing too large
  const updated = [...processed, messageId].slice(-100);

  await updateContext(normalizedPhone, {
    processed_messages: updated
  });
}
