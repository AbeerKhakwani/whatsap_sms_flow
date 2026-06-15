// lib/payout-calculation.js — single source of truth for seller payout math.
//
// payout = (grossPrice − discount − platformFee) × (100 − commission%) / 100
//
// The $10 platform fee comes off the top FIRST; commission and discount are taken
// from the post-fee amount. The fee is never part of the base commission is applied to.
//
// Pure, dependency-free ESM so both the server (api/, lib/) and the React
// frontend (src/) can import it. Do not add Node-only imports here.

export const PLATFORM_FEE = 10;            // flat fee, comes off the top BEFORE commission
export const DEFAULT_COMMISSION_RATE = 18; // ONLY a starting rate for brand-new listings;
                                           // never used to "guess" a rate at sale time.

/**
 * Calculate a seller's payout for a sale (or a prospective listing).
 *
 * @param {Object}  opts
 * @param {number}  opts.grossPrice      Full price the buyer paid before any discount.
 *                                       At listing time this is the listing price
 *                                       (asking + fee); at sale time it's item.price.
 * @param {number} [opts.discount=0]     Order-level discount allocated to this item.
 * @param {number|string|null} opts.commissionRate  Per-item commission % from the
 *                                       Shopify metafield. null/missing → "unknown".
 * @param {number} [opts.platformFee=PLATFORM_FEE]  Flat fee off the top.
 * @returns {{ commissionKnown: boolean, commissionBase: number,
 *             commissionAmount: number|null, sellerPayout: number|null,
 *             platformFee: number }}
 */
export function calculateSellerPayout({ grossPrice, discount = 0, commissionRate, platformFee = PLATFORM_FEE }) {
  const rate = (commissionRate == null || Number.isNaN(Number(commissionRate))) ? null : Number(commissionRate);
  const fee = Number(platformFee) || 0;
  const commissionBase = Math.max(0, (Number(grossPrice) || 0) - (Number(discount) || 0) - fee);

  if (rate === null) {
    // Commission unknown — do NOT guess. Caller routes this to the needs_commission state.
    return { commissionKnown: false, commissionBase, commissionAmount: null, sellerPayout: null, platformFee: fee };
  }

  return {
    commissionKnown: true,
    commissionBase,
    commissionAmount: commissionBase * (rate / 100),
    sellerPayout:     commissionBase * ((100 - rate) / 100),
    platformFee:      fee,
  };
}
