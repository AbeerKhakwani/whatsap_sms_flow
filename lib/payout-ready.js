// lib/payout-ready.js
//
// Single source of truth for "should this sale become Ready to pay?" — shared by the
// daily cron, the Sync-from-Shopify endpoint, and (read-only) the UI. Pure + no imports
// so it can be unit-tested and reused everywhere without drift.
//
// The window is 3 days (72h) everywhere; only the start point differs:
//   • Tracked   (has a shipping label) → 3 days after DELIVERED
//   • Untracked (no label)             → 3 days after FULFILLED
// A buyer tapping "Yes, got it" short-circuits the wait. Admin On-hold blocks it.

export const READY_WINDOW_MS = 72 * 60 * 60 * 1000; // 3 days

/**
 * @param {object} tx - transaction row (raw DB shape)
 * @param {number} [now=Date.now()]
 * @returns {{ ready: boolean, reason: string }}
 *   reason ∈ buyer_confirmed | delivered_window | fulfilled_window | already
 *          | on_hold | terminal | awaiting_delivery | awaiting_fulfillment | not_started
 */
export function payoutReadiness(tx = {}, now = Date.now()) {
  const status = tx.payout_status;

  if (status === 'paid' || status === 'cancelled') return { ready: false, reason: 'terminal' };
  if (tx.payout_hold) return { ready: false, reason: 'on_hold' };
  if (status === 'available') return { ready: true, reason: 'already' };

  // Buyer explicitly confirmed receipt → ready now, regardless of the timer.
  if (tx.review_responded_at) return { ready: true, reason: 'buyer_confirmed' };

  const ms = (v) => (v ? new Date(v).getTime() : null);
  const elapsed = (v) => { const t = ms(v); return t == null ? null : now - t; };
  const tracked = !!(tx.tracking_number || tx.shipping_label_url);

  if (tracked) {
    const e = elapsed(tx.delivered_at);
    if (e == null) return { ready: false, reason: 'awaiting_delivery' };
    return e >= READY_WINDOW_MS ? { ready: true, reason: 'delivered_window' } : { ready: false, reason: 'awaiting_delivery' };
  }

  const e = elapsed(tx.fulfilled_at);
  if (e == null) return { ready: false, reason: 'not_started' };
  return e >= READY_WINDOW_MS ? { ready: true, reason: 'fulfilled_window' } : { ready: false, reason: 'awaiting_fulfillment' };
}
