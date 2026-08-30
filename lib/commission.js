// lib/commission.js — SINGLE SOURCE OF TRUTH for what commission a listing carries.
//
// Precedence, highest first:
//   1. a per-seller agreed rate
//   2. concierge (Phirstory holds and ships it, so it takes a larger cut)
//   3. the house default
//
// Seller overrides beat the concierge rate deliberately: cuebee64@aol.com stays at 50%
// and nskhan9393@gmail.com stays at 60% on concierge items, rather than dropping to 40%.

export const DEFAULT_COMMISSION = 18;
export const CONCIERGE_COMMISSION = 40;

/** Agreed per-seller rates. Keys MUST be lowercase — lookups are lowercased. */
export const SELLER_COMMISSION = {
  'nskhan9393@gmail.com': 60,
  'cuebee64@aol.com': 50,
};

/**
 * @param {{sellerEmail?: string|null, isConcierge?: boolean}} opts
 * @returns {{rate: number, reason: 'seller'|'concierge'|'default'}}
 */
export function resolveCommission({ sellerEmail, isConcierge } = {}) {
  const email = String(sellerEmail || '').trim().toLowerCase();
  if (email && Object.prototype.hasOwnProperty.call(SELLER_COMMISSION, email)) {
    return { rate: SELLER_COMMISSION[email], reason: 'seller' };
  }
  if (isConcierge) return { rate: CONCIERGE_COMMISSION, reason: 'concierge' };
  return { rate: DEFAULT_COMMISSION, reason: 'default' };
}
