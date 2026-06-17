// lib/buyer-acceptance.js
//
// Pure helper (no imports, no side effects) for deciding whether a sale's BUYER has
// accepted delivery. Shared by the admin seller page and the seller portal — and ready
// for the Phase-2 payout engine — so the rule lives in exactly ONE place.
//
// A sale is "accepted" when either:
//   • the buyer tapped "Yes, got it" on the delivery text  → via 'buyer'
//   • it auto-cleared after the 3-day window (payout released) → via 'auto'

/**
 * @param {object} fields
 * @param {string|null} [fields.reviewRespondedAt] - timestamp the buyer confirmed receipt
 * @param {string|null} [fields.payoutStatus]      - transaction payout_status
 * @returns {{ accepted: boolean, via: 'buyer'|'auto'|null, label: string, sublabel: string }}
 */
export function buyerAcceptance({ reviewRespondedAt, payoutStatus } = {}) {
  if (reviewRespondedAt) {
    return { accepted: true, via: 'buyer', label: 'Buyer accepted', sublabel: 'confirmed by buyer' };
  }
  if (payoutStatus === 'available' || payoutStatus === 'paid') {
    return { accepted: true, via: 'auto', label: 'Buyer accepted', sublabel: 'auto · 3 days' };
  }
  return { accepted: false, via: null, label: '', sublabel: '' };
}
