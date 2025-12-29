// lib/sellers.js
// Shared seller lookup and management

import { createClient } from '@supabase/supabase-js';

const getSupabase = () => createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Find a seller by email or phone
 */
export async function findSeller({ email, phone }) {
  const supabase = getSupabase();
  let seller = null;

  if (email) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .eq('email', email)
      .single();
    if (data) seller = data;
  }

  if (!seller && phone) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .eq('phone', phone)
      .single();
    if (data) seller = data;
  }

  return seller;
}

/**
 * Create a new seller
 */
export async function createSeller({ email, phone, name, shopifyProductIds = [] }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('sellers')
    .insert({
      email: email || null,
      phone: phone || null,
      name: name || (email ? email.split('@')[0] : 'Seller'),
      shopify_product_ids: shopifyProductIds,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Create seller error:', error);
    throw error;
  }

  return data;
}

/**
 * Find or create a seller by email/phone
 */
export async function findOrCreateSeller({ email, phone }) {
  if (!email && !phone) return null;

  let seller = await findSeller({ email, phone });

  if (!seller) {
    seller = await createSeller({ email, phone });
  }

  return seller;
}

/**
 * Add a Shopify product ID to seller's array
 */
export async function addProductToSeller(sellerId, shopifyProductId) {
  const supabase = getSupabase();

  const { data: seller } = await supabase
    .from('sellers')
    .select('shopify_product_ids')
    .eq('id', sellerId)
    .single();

  const currentIds = seller?.shopify_product_ids || [];
  const productIdStr = shopifyProductId.toString();

  if (currentIds.includes(productIdStr)) {
    return; // Already has this ID
  }

  await supabase
    .from('sellers')
    .update({ shopify_product_ids: [...currentIds, productIdStr] })
    .eq('id', sellerId);

  console.log(`Added product ${productIdStr} to seller ${sellerId}`);
}

/**
 * Remove a Shopify product ID from seller's array
 */
export async function removeProductFromSeller(sellerId, shopifyProductId) {
  const supabase = getSupabase();

  const { data: seller } = await supabase
    .from('sellers')
    .select('shopify_product_ids')
    .eq('id', sellerId)
    .single();

  if (!seller?.shopify_product_ids) return;

  const productIdStr = shopifyProductId.toString();
  const updatedIds = seller.shopify_product_ids.filter(
    id => id !== productIdStr && id !== shopifyProductId
  );

  await supabase
    .from('sellers')
    .update({ shopify_product_ids: updatedIds })
    .eq('id', sellerId);

  console.log(`Removed product ${productIdStr} from seller ${sellerId}`);
}

/**
 * Get seller by ID
 */
export async function getSellerById(sellerId) {
  const supabase = getSupabase();

  const { data } = await supabase
    .from('sellers')
    .select('*')
    .eq('id', sellerId)
    .single();

  return data;
}
