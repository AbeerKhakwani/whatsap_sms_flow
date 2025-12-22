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
  const { data } = await supabase
    .from('sellers')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  return data;
}

export async function findSellerByEmail(email) {
  const normalized = email.toLowerCase().trim();
  const { data } = await supabase
    .from('sellers')
    .select('*')
    .or(`email.ilike.${normalized},paypal_email.ilike.${normalized}`)
    .maybeSingle();
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
    context: {}
  });
}


/**
 * Get the most recent incomplete listing for a seller
 * @param {string} sellerId - The seller's ID
 * @returns {object|null} - The incomplete listing or null
 */
export async function getIncompleteListing(sellerId) {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('status', 'incomplete')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Delete a listing
 * @param {string} listingId - The listing ID to delete
 */
export async function deleteListing(listingId) {
  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', listingId);

  if (error) throw error;
}
export { supabase };
