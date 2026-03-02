// lib/shopify-metafields.js
// Single-purpose: fetch, extract, and upsert Shopify product metafields.
// Replaces 5+ copies of the same fetch-parse-extract pattern across seller.js and admin-listings.js.

const API_VERSION = '2024-10';

const getConfig = () => ({
  url: process.env.VITE_SHOPIFY_STORE_URL,
  token: process.env.VITE_SHOPIFY_ACCESS_TOKEN
});

// ─── Fetch ───────────────────────────────────────────────

/**
 * Fetch metafields for a single product.
 * @param {string|number} productId
 * @returns {Promise<Array>} metafields array (empty on error)
 */
export async function fetchMetafields(productId) {
  const { url, token } = getConfig();
  try {
    const res = await fetch(
      `https://${url}/admin/api/${API_VERSION}/products/${productId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    if (!res.ok) return [];
    const { metafields } = await res.json();
    return metafields || [];
  } catch (e) {
    console.error(`Failed to fetch metafields for product ${productId}:`, e.message);
    return [];
  }
}

/**
 * Batch fetch metafields for multiple products in parallel.
 * @param {Array<string|number>} productIds
 * @returns {Promise<Object>} { [productId]: metafields[] }
 */
export async function fetchMetafieldsBatch(productIds) {
  const results = await Promise.all(
    productIds.map(async (id) => ({
      productId: id,
      metafields: await fetchMetafields(id)
    }))
  );
  const map = {};
  for (const { productId, metafields } of results) {
    map[productId] = metafields;
  }
  return map;
}

// ─── Extract ─────────────────────────────────────────────

/**
 * Get a single metafield value by namespace + key.
 * @param {Array} metafields
 * @param {string} namespace
 * @param {string} key
 * @returns {string|null}
 */
export function getMetafieldValue(metafields, namespace, key) {
  return metafields?.find(m => m.namespace === namespace && m.key === key)?.value ?? null;
}

/**
 * Extract pricing info from metafields with fallback calculations.
 * This is the most repeated pattern — appears 5+ times across seller.js and admin-listings.js.
 *
 * @param {Array} metafields
 * @param {number} listingPrice - The Shopify variant price (includes $10 fee)
 * @param {number} [defaultCommission=18]
 * @returns {{ commissionRate: number, sellerAskingPrice: number, sellerPayout: number }}
 */
export function extractPricing(metafields, listingPrice, defaultCommission = 18) {
  const commissionRate = parseFloat(getMetafieldValue(metafields, 'pricing', 'commission_rate')) || defaultCommission;
  let sellerAskingPrice = parseFloat(getMetafieldValue(metafields, 'pricing', 'seller_asking_price')) || null;
  let sellerPayout = parseFloat(getMetafieldValue(metafields, 'pricing', 'seller_payout')) || null;

  // Try parsing payout as money JSON (admin-listings stores it as { amount, currency_code })
  if (!sellerPayout) {
    const payoutRaw = getMetafieldValue(metafields, 'pricing', 'seller_payout');
    if (payoutRaw) {
      try {
        const parsed = JSON.parse(payoutRaw);
        sellerPayout = parseFloat(parsed.amount) || null;
      } catch { /* not JSON, already tried parseFloat above */ }
    }
  }

  const price = parseFloat(listingPrice) || 0;

  // Fallback calculations
  if (sellerAskingPrice === null) {
    sellerAskingPrice = Math.max(0, price - 10); // Remove $10 listing fee
  }
  if (sellerPayout === null) {
    sellerPayout = sellerAskingPrice * ((100 - commissionRate) / 100);
  }

  return { commissionRate, sellerAskingPrice, sellerPayout };
}

/**
 * Extract seller email from product metafields.
 * @param {Array} metafields
 * @returns {string|null}
 */
export function getSellerEmail(metafields) {
  return getMetafieldValue(metafields, 'seller', 'email');
}

/**
 * Extract seller ID from product metafields.
 * @param {Array} metafields
 * @returns {string|null}
 */
export function getSellerId(metafields) {
  return getMetafieldValue(metafields, 'seller', 'id');
}

// ─── Upsert ──────────────────────────────────────────────

/**
 * Create or update a metafield on a product.
 * If metafield exists (found in `existingMetafields`), PUT to update.
 * Otherwise, POST to create.
 *
 * @param {string|number} productId
 * @param {Array} existingMetafields - Current metafields (to find existing IDs)
 * @param {string} namespace
 * @param {string} key
 * @param {string} value - String value (will be sent as-is)
 * @param {string} [type='number_decimal'] - Metafield type
 */
export async function upsertMetafield(productId, existingMetafields, namespace, key, value, type = 'number_decimal') {
  const { url, token } = getConfig();
  const headers = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token };
  const existing = (existingMetafields || []).find(m => m.namespace === namespace && m.key === key);

  if (existing) {
    await fetch(`https://${url}/admin/api/${API_VERSION}/metafields/${existing.id}.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ metafield: { id: existing.id, value: value.toString() } })
    });
  } else {
    await fetch(`https://${url}/admin/api/${API_VERSION}/products/${productId}/metafields.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ metafield: { namespace, key, value: value.toString(), type } })
    });
  }
}

/**
 * Update pricing metafields after a price change.
 * Fetches existing metafields, recalculates, and upserts.
 *
 * @param {string|number} productId
 * @param {number} newPrice - New listing price (includes $10 fee)
 * @param {number} [fallbackCommission=18] - Default commission if not in metafields
 * @returns {{ commissionRate: number, askingPrice: number, payout: number }}
 */
export async function updatePricingMetafields(productId, newPrice, fallbackCommission = 18) {
  const metafields = await fetchMetafields(productId);

  const existingCommission = getMetafieldValue(metafields, 'pricing', 'commission_rate');
  const commissionRate = parseFloat(existingCommission) || fallbackCommission;

  const askingPrice = Math.max(0, parseFloat(newPrice) - 10);
  const payout = askingPrice * (1 - commissionRate / 100);

  await Promise.all([
    upsertMetafield(productId, metafields, 'pricing', 'seller_asking_price', askingPrice.toFixed(2)),
    upsertMetafield(productId, metafields, 'pricing', 'seller_payout', payout.toFixed(2))
  ]);

  return { commissionRate, askingPrice, payout };
}
