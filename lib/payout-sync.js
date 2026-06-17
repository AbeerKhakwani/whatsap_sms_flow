// lib/payout-sync.js
//
// One shared "sync from Shopify + release ready payouts" routine, used by BOTH the daily
// cron (the automatic once-a-day check) and the admin "Sync from Shopify" button — so the
// logic lives in exactly one place.
//
// For each open sale it reads the Shopify order, writes the fulfillment fields the
// payout-ready engine needs (fulfilled_at / delivered_at / tracking / shipping_status),
// then releases any sale the engine says is ready. dryRun reports changes without writing.

import { supabase } from './supabase-admin.js';
import { releasePayout } from './payout-service.js';
import { payoutReadiness, READY_WINDOW_MS } from './payout-ready.js';
import { sendBuyerConfirmRequest } from './buyer-review.js';

const CANDIDATE_FIELDS = 'id, order_id, product_title, payout_status, payout_hold, shipping_status, review_responded_at, review_request_sent_at, tracking_number, carrier, shipping_label_url, delivered_at, fulfilled_at, contest_status';

async function fetchShopifyOrder(shop, token, orderId, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(
      `https://${shop}/admin/api/2024-10/orders/${orderId}.json?fields=id,fulfillment_status,fulfillments`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    if (r.ok) return (await r.json()).order;
    if (r.status === 429) { await new Promise(s => setTimeout(s, (parseInt(r.headers.get('retry-after') || '2', 10) + 1) * 1000)); continue; }
    if (r.status === 404) return null;
    throw new Error(`Shopify ${r.status}`);
  }
  return null;
}

// Map a Shopify order's fulfillment state onto the transaction fields, only filling gaps
// (never overrides a value we already have, never touches a concierge item's status).
function fulfillmentUpdates(tx, order) {
  const fulfillments = order.fulfillments || [];
  const fulfilled = order.fulfillment_status === 'fulfilled' || fulfillments.length > 0;
  const f0 = fulfillments[0] || {};
  const deliveredF = fulfillments.find(f => f.shipment_status === 'delivered');
  const delivered = !!deliveredF;
  const fulfilledAt = fulfillments.length ? fulfillments.map(f => f.created_at).filter(Boolean).sort()[0] : null;

  const updates = {};
  if (fulfilled && !tx.fulfilled_at && fulfilledAt) updates.fulfilled_at = fulfilledAt;
  if (f0.tracking_number && !tx.tracking_number) {
    updates.tracking_number = f0.tracking_number;
    if (f0.tracking_company) updates.carrier = f0.tracking_company;
  }
  // Real delivery time ≈ the delivered fulfillment's updated_at (matches the carrier
  // "delivered" event within minutes). Set it if missing, OR correct a previously-stamped
  // value that's LATER than reality (e.g. an earlier sync that used "now" for an old delivery).
  if (delivered) {
    const realDelivered = deliveredF.updated_at || tx.delivered_at || new Date().toISOString();
    if (!tx.delivered_at || new Date(realDelivered) < new Date(tx.delivered_at)) {
      updates.delivered_at = realDelivered;
    }
  }
  if (tx.shipping_status !== 'concierge') {
    const nextShip = delivered ? 'delivered' : (fulfilled ? 'shipped' : tx.shipping_status);
    if (nextShip && nextShip !== tx.shipping_status) updates.shipping_status = nextShip;
  }
  return updates;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false] - report what would change without writing
 * @returns {Promise<{checked, skipped, updated, released, changes, errors}>}
 */
export async function runPayoutSync({ dryRun = false } = {}) {
  const SHOP = process.env.VITE_SHOPIFY_STORE_URL;
  const TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

  const { data: txns, error } = await supabase
    .from('transactions')
    .select(CANDIDATE_FIELDS)
    .not('payout_status', 'in', '(paid,cancelled)');
  if (error) throw new Error(error.message);

  const results = { checked: 0, skipped: 0, updated: 0, released: 0, accepted: 0, changes: [], errors: [] };

  for (const tx of txns || []) {
    let merged = { ...tx };

    // 1. Refresh fulfillment data from Shopify (real numeric order ids only).
    if (/^\d+$/.test(String(tx.order_id))) {
      results.checked++;
      try {
        const order = await fetchShopifyOrder(SHOP, TOKEN, tx.order_id);
        if (!order) {
          results.skipped++;
        } else {
          const updates = fulfillmentUpdates(tx, order);
          if (Object.keys(updates).length) {
            merged = { ...tx, ...updates };
            if (!dryRun) {
              const { error: upErr } = await supabase.from('transactions').update(updates).eq('id', tx.id);
              if (upErr) throw new Error(upErr.message);
            }
            results.updated++;
            results.changes.push({ order: tx.order_id, product: tx.product_title, ...updates });
          }

          // Newly detected delivery → send the buyer "did it arrive? accept" request once,
          // but only for RECENT deliveries (inside the window). No point pinging a buyer about
          // something delivered weeks ago that we're only now backfilling.
          const freshlyDelivered = updates.delivered_at && (Date.now() - new Date(updates.delivered_at).getTime() < READY_WINDOW_MS);
          if (freshlyDelivered && !tx.review_request_sent_at) {
            if (dryRun) {
              results.changes.push({ order: tx.order_id, product: tx.product_title, accept_request: 'would send' });
            } else {
              const { sent } = await sendBuyerConfirmRequest(tx.id).catch(() => ({ sent: false }));
              if (sent) {
                results.accepted++;
                results.changes.push({ order: tx.order_id, product: tx.product_title, accept_request: 'sent' });
              }
            }
          }
        }
      } catch (err) {
        results.errors.push({ order: tx.order_id, product: tx.product_title, error: err.message });
      }
    } else {
      results.skipped++;
    }

    // 2. Release if the engine now says ready. Skip disputed sales.
    if (tx.contest_status) continue;
    const verdict = payoutReadiness(merged);
    if (verdict.ready && merged.payout_status !== 'available') {
      if (dryRun) {
        results.released++;
        results.changes.push({ order: tx.order_id, product: tx.product_title, release: verdict.reason });
      } else {
        const { released } = await releasePayout(merged);
        if (released) {
          results.released++;
          results.changes.push({ order: tx.order_id, product: tx.product_title, release: verdict.reason });
        }
      }
    }
  }

  return results;
}
