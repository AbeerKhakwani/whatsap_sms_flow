// lib/messages.js
// Message logging for WhatsApp and email notifications

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Log a message sent to a seller
 * @param {Object} params
 * @param {string} params.sellerId - Seller UUID
 * @param {string} params.type - 'whatsapp' or 'email'
 * @param {string} params.recipient - Phone number or email address
 * @param {string} params.content - Message body
 * @param {string} [params.subject] - Email subject (optional)
 * @param {string} [params.context] - Context like 'listing_approved', 'item_sold', 'payout_sent'
 * @param {Object} [params.metadata] - Additional data like product_id, amount
 * @param {string} [params.status] - 'sent', 'delivered', 'failed'
 */
export async function logMessage({
  sellerId,
  type,
  recipient,
  content,
  subject = null,
  context = null,
  metadata = null,
  status = 'sent'
}) {
  try {
    const { error } = await supabase.from('messages').insert({
      seller_id: sellerId,
      type,
      recipient,
      content,
      subject,
      context,
      metadata,
      status
    });

    if (error) {
      console.error('Failed to log message:', error);
    }
  } catch (err) {
    console.error('Message logging error:', err);
  }
}

/**
 * Get message history for a seller
 * @param {string} sellerId - Seller UUID
 * @param {number} [limit=50] - Max messages to return
 */
export async function getSellerMessages(sellerId, limit = 50) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get messages:', error);
    return [];
  }

  return data || [];
}
