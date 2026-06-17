// api/cron/process-payouts.js
// Daily cron job to process payouts after contest window expires
// Vercel Cron: runs at 10 AM daily

import { supabase } from '../supabase-admin.js';
import { runPayoutSync } from '../payout-sync.js';
import { sendBuyerConfirmRequest, sendSellerReviewRequest } from '../buyer-review.js';

export default async function handler(req, res) {
  // Verify this is a cron request
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('💰 Running payout processing cron job...');

  try {
    // Once-a-day auto-check: sync fulfillment from Shopify + release anything now ready.
    // Same shared routine the "Sync from Shopify" button uses (lib/payout-sync.js).
    const sync = await runPayoutSync({ dryRun: false });
    const results = { total: sync.checked, processed: sync.released, notified: sync.released, updated: sync.updated, errors: sync.errors };
    console.log(`✅ Payout sync complete: ${sync.updated} updated, ${sync.released} released, ${sync.errors.length} errors`);

    // Safety net: any delivered tx that never got a buyer-confirmation request
    // (e.g. the webhook send failed) — send it now.
    const { data: missingConfirm } = await supabase
      .from('transactions')
      .select('id')
      .eq('shipping_status', 'delivered')
      .is('review_request_sent_at', null)
      .limit(100);
    let confirmsSent = 0;
    for (const t of missingConfirm || []) {
      const r = await sendBuyerConfirmRequest(t.id).catch(() => ({ sent: false }));
      if (r.sent) confirmsSent++;
    }

    // 3b: ~1 week after delivery, ask the buyer to rate the seller (once).
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: dueForReview } = await supabase
      .from('transactions')
      .select('id')
      .lt('delivered_at', weekAgo)
      .is('seller_review_sent_at', null)
      .not('delivered_at', 'is', null)
      .limit(100);
    let reviewsRequested = 0;
    for (const t of dueForReview || []) {
      const r = await sendSellerReviewRequest(t.id).catch(() => ({ sent: false }));
      if (r.sent) reviewsRequested++;
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${results.processed} payouts`,
      results: { ...results, confirmsSent, reviewsRequested }
    });

  } catch (err) {
    console.error('Cron job error:', err);
    return res.status(500).json({ error: 'Cron job failed', message: err.message });
  }
}
