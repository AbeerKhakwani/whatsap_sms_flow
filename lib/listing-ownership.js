// lib/listing-ownership.js
//
// Single source of truth for product ownership writes and reads.
//
// THE PROBLEM THIS SOLVES:
// Ownership is tracked in 3 places: Shopify metafields, sellers.shopify_product_ids array,
// and the listings table. Every write site that forgets to update all 3 causes silent drift.
// This file is the one place all ownership mutations go through.
//
// MIGRATION STATUS:
// Phase 1 — file exists, nothing calls it yet (no behavior change)
// Phase 3 — all writer sites will be switched to setProductOwnership()
// Phase 5 — stop writing the array, delete addProductToSeller/removeProductFromSeller
// Phase 6 — DROP COLUMN shopify_product_ids

import { supabase } from './supabase-admin.js';
import { fetchMetafields, upsertMetafield } from './shopify-metafields.js';
import { cacheBust } from './cache.js';

const CACHE_ALL = 'listings:all';

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Assign a Shopify product to a seller — updates all 3 sources of truth + busts cache.
 *
 * This is the ONE function all ownership mutations should call.
 * Pass `previousSellerEmail` when reassigning so the old seller's cache gets busted too.
 *
 * @param {string|number} productId       - Shopify product ID
 * @param {string}        sellerEmail     - New owner's email
 * @param {object}        [opts]
 * @param {string}        [opts.status]             - listings table status (default: 'active')
 * @param {string}        [opts.previousSellerEmail] - old owner email, for cache bust on reassign
 */
export async function setProductOwnership(productId, sellerEmail, opts = {}) {
  const { status = 'listed', previousSellerEmail } = opts;
  const productIdStr = productId.toString();

  // 1. Look up the seller in Supabase so we have their ID
  const { data: seller, error: sellerErr } = await supabase
    .from('sellers')
    .select('id, email, shopify_product_ids')
    .eq('email', sellerEmail)
    .single();

  if (sellerErr || !seller) {
    throw new Error(`setProductOwnership: seller not found for email ${sellerEmail}`);
  }

  // 2. Update Shopify metafields — these are the authoritative source of truth.
  //    The order webhook reads these on purchase, so they must always be correct.
  const metafields = await fetchMetafields(productIdStr);
  await Promise.all([
    upsertMetafield(productIdStr, metafields, 'seller', 'email', seller.email, 'single_line_text_field'),
    upsertMetafield(productIdStr, metafields, 'seller', 'id', seller.id, 'single_line_text_field'),
  ]);

  // 3. Update sellers.shopify_product_ids array (dual-write — kept until Phase 5).
  //    If reassigning, also remove from the previous seller's array.
  if (previousSellerEmail && previousSellerEmail !== sellerEmail) {
    const { data: prevSeller } = await supabase
      .from('sellers')
      .select('id, shopify_product_ids')
      .eq('email', previousSellerEmail)
      .single();

    if (prevSeller) {
      const cleaned = (prevSeller.shopify_product_ids || []).filter(id => id !== productIdStr);
      await supabase
        .from('sellers')
        .update({ shopify_product_ids: cleaned })
        .eq('id', prevSeller.id);
    }
  }

  const currentIds = seller.shopify_product_ids || [];
  if (!currentIds.includes(productIdStr)) {
    await supabase
      .from('sellers')
      .update({ shopify_product_ids: [...currentIds, productIdStr] })
      .eq('id', seller.id);
  }

  // 4. Upsert the listings table row — this becomes the primary reader in Phase 4.
  await supabase
    .from('listings')
    .upsert({
      seller_id: seller.id,
      shopify_product_id: productIdStr,
      status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'shopify_product_id' });

  // 5. Bust Redis caches so stale data doesn't linger.
  const cacheKeys = [
    CACHE_ALL,
    `listings:seller:${sellerEmail.toLowerCase()}`,
  ];
  if (previousSellerEmail && previousSellerEmail !== sellerEmail) {
    cacheKeys.push(`listings:seller:${previousSellerEmail.toLowerCase()}`);
  }
  await cacheBust(...cacheKeys);

  console.log(`[ownership] product ${productIdStr} → ${sellerEmail} (status: ${status})`);
  return { productId: productIdStr, sellerEmail, sellerId: seller.id };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get the current owner of a product by reading Shopify metafields (authoritative).
 *
 * @param {string|number} productId
 * @returns {Promise<{ email: string|null, sellerId: string|null }>}
 */
export async function getProductOwner(productId) {
  const metafields = await fetchMetafields(productId.toString());
  const email = metafields.find(m => m.namespace === 'seller' && m.key === 'email')?.value ?? null;
  const sellerId = metafields.find(m => m.namespace === 'seller' && m.key === 'id')?.value ?? null;
  return { email, sellerId };
}

/**
 * List all products belonging to a seller by querying the listings table.
 * (Replaces the shopify_product_ids array lookup — active from Phase 4 onward.)
 *
 * @param {string} sellerEmail
 * @param {object} [opts]
 * @param {string|string[]} [opts.status] - filter by status (e.g. 'active', ['active','pending'])
 * @returns {Promise<Array<{ shopify_product_id: string, status: string, seller_id: string }>>}
 */
export async function listSellerProducts(sellerEmail, opts = {}) {
  const { status } = opts;

  const { data: seller } = await supabase
    .from('sellers')
    .select('id')
    .eq('email', sellerEmail)
    .single();

  if (!seller) return [];

  let query = supabase
    .from('listings')
    .select('shopify_product_id, status, seller_id, updated_at')
    .eq('seller_id', seller.id);

  if (status) {
    if (Array.isArray(status)) {
      query = query.in('status', status);
    } else {
      query = query.eq('status', status);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error('[ownership] listSellerProducts error:', error.message);
    return [];
  }
  return data || [];
}
