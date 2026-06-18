/**
 * Canonical product-tag helpers.
 *
 * Shopify stores product tags as a single comma-separated string. Our APIs
 * sometimes hand them to the frontend as that raw string and sometimes as a
 * pre-split string[]. That mismatch already white-screened the review queue
 * (a `.split` call on an array — commit 0ac1a15).
 *
 * `toTagArray` tolerates EITHER shape so a consumer can never crash on the wrong
 * one. The canonical wire shape for admin-listings responses is now a string[];
 * use `toTagString` when writing back to Shopify (which wants the comma string).
 */

export function toTagArray(tags) {
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

export function toTagString(tags) {
  return toTagArray(tags).join(', ');
}
