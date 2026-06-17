// api/cron/process-payouts.js
// Daily cron job to process payouts after contest window expires
// Vercel Cron: runs at 10 AM daily

import { supabase } from '../supabase-admin.js';
import { releasePayout } from '../payout-service.js';
import { payoutReadiness } from '../payout-ready.js';
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
    const nowMs = Date.now();

    // Candidates = anything that could still become Ready to pay: not terminal, not on
    // hold, no open contest. The payout-ready engine then decides each one (tracked:
    // delivered + 3 days · untracked: fulfilled + 3 days · buyer confirm short-circuits).
    const { data: candidates, error: queryError } = await supabase
      .from('transactions')
      .select(`
        id, product_title, seller_payout, seller_id,
        payout_status, payout_hold, review_responded_at,
        tracking_number, shipping_label_url, delivered_at, fulfilled_at,
        sellers ( id, name, email, phone )
      `)
      .not('payout_status', 'in', '(paid,cancelled,available)')
      .eq('payout_hold', false)
      .is('contest_status', null);

    if (queryError) {
      console.error('Error querying transactions:', queryError);
      return res.status(500).json({ error: 'Database error', details: queryError.message });
    }

    console.log(`Evaluating ${candidates?.length || 0} payout candidates`);

    const results = {
      total: candidates?.length || 0,
      processed: 0,
      notified: 0,
      errors: []
    };

    for (const transaction of candidates || []) {
      const verdict = payoutReadiness(transaction, nowMs);
      if (!verdict.ready) continue;
      try {
        // Single source of truth: release lives in the payout service (silent).
        const { released } = await releasePayout(transaction);
        if (released) {
          results.processed++;
          results.notified++;
          console.log(`  ✅ Released "${transaction.product_title}" (${verdict.reason}) for payout`);
        }
      } catch (err) {
        console.error(`  Error processing ${transaction.id}:`, err.message);
        results.errors.push({ id: transaction.id, error: err.message });
      }
    }

    console.log(`✅ Payout processing complete: ${results.processed} processed, ${results.notified} notified`);

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
