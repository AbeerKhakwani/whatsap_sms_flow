// lib/metafield-helpers.js
// Helper functions for reading structured metafields

/**
 * Get metafield value from product
 * Handles both structured and unstructured formats
 */
export function getMetafieldValue(product, namespace, key) {
  const metafield = product.metafields?.find(m => m.namespace === namespace && m.key === key);
  if (!metafield) return null;

  const value = metafield.value;
  const type = metafield.type;

  // Handle money type
  if (type === 'money') {
    try {
      const parsed = JSON.parse(value);
      return parsed.amount || value;
    } catch {
      return value; // Fallback for old unstructured format
    }
  }

  return value;
}

/**
 * Get seller email from product metafields
 */
export function getSellerEmail(product) {
  return getMetafieldValue(product, 'seller', 'email');
}

/**
 * Get seller phone from product metafields
 */
export function getSellerPhone(product) {
  return getMetafieldValue(product, 'seller', 'phone');
}

/**
 * Get seller ID from product metafields
 */
export function getSellerId(product) {
  return getMetafieldValue(product, 'seller', 'id');
}

/**
 * Get commission rate from product metafields
 */
export function getCommissionRate(product) {
  const value = getMetafieldValue(product, 'pricing', 'commission_rate');
  return value ? parseInt(value) : null;
}

/**
 * Get seller asking price from product metafields
 */
export function getSellerAskingPrice(product) {
  const value = getMetafieldValue(product, 'pricing', 'seller_asking_price');
  return value ? parseFloat(value) : null;
}

/**
 * Get seller payout from product metafields
 */
export function getSellerPayout(product) {
  const value = getMetafieldValue(product, 'pricing', 'seller_payout');
  return value ? parseFloat(value) : null;
}
