// lib/seller-lookup.js
// Single-purpose: find a seller in Supabase by email, phone, or Shopify product ID.
// Replaces 3+ different lookup implementations across auth.js, admin-listings.js, seller.js.

import { supabase } from './supabase-admin.js';

/**
 * Find a seller by email (case-insensitive).
 * @param {string} email
 * @param {string} [select='*']
 * @returns {Promise<Object|null>}
 */
export async function findSellerByEmail(email, select = '*') {
  if (!email) return null;
  const { data } = await supabase
    .from('sellers')
    .select(select)
    .ilike('email', email.toLowerCase())
    .maybeSingle();
  return data;
}

/**
 * Find a seller by phone number.
 * Normalizes the input and tries multiple formats to handle
 * inconsistent storage (+1, no country code, dashes, spaces, etc.)
 *
 * @param {string} phone
 * @param {string} [select='*']
 * @returns {Promise<Object|null>}
 */
export async function findSellerByPhone(phone, select = '*') {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);

  // Try exact match with common formats
  const formats = [phone, digits, last10, `+${digits}`, `+1${last10}`].filter(Boolean);
  for (const format of formats) {
    const { data } = await supabase
      .from('sellers')
      .select(select)
      .eq('phone', format)
      .maybeSingle();
    if (data) return data;
  }

  // Fallback: pattern match on last 10 digits
  if (last10.length === 10) {
    const { data } = await supabase
      .from('sellers')
      .select(select)
      .like('phone', `%${last10}`)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

/**
 * Find a seller who has a specific Shopify product ID in their list.
 * @param {string|number} productId
 * @param {string} [select='*']
 * @returns {Promise<Object|null>}
 */
export async function findSellerByProductId(productId, select = '*') {
  if (!productId) return null;
  const { data } = await supabase
    .from('sellers')
    .select(select)
    .contains('shopify_product_ids', [productId.toString()])
    .maybeSingle();
  return data;
}

/**
 * Smart seller lookup — auto-detects email vs phone.
 * @param {string} identifier - Email address or phone number
 * @param {string} [select='*']
 * @returns {Promise<Object|null>}
 */
export async function findSeller(identifier, select = '*') {
  if (!identifier) return null;
  return identifier.includes('@')
    ? findSellerByEmail(identifier, select)
    : findSellerByPhone(identifier, select);
}

/**
 * Resolve a seller from metafield data — try email first, then product ID fallback.
 * This is the pattern used in admin-listings.js and shopify-webhook.js.
 *
 * @param {string|null} email - Seller email from metafields
 * @param {string|null} sellerId - Seller UUID from metafields
 * @param {string|number|null} productId - Shopify product ID for fallback
 * @param {string} [select='*']
 * @returns {Promise<Object|null>}
 */
export async function resolveSellerFromProduct(email, sellerId, productId, select = '*') {
  // Try direct ID first (fastest)
  if (sellerId) {
    const { data } = await supabase
      .from('sellers')
      .select(select)
      .eq('id', sellerId)
      .single();
    if (data) return data;
  }

  // Try email
  if (email) {
    const seller = await findSellerByEmail(email, select);
    if (seller) return seller;
  }

  // Fallback: find by product ID in shopify_product_ids array
  if (productId) {
    return findSellerByProductId(productId, select);
  }

  return null;
}
