// api/cron/process-payouts.js
// Daily cron job to process payouts after contest window expires
// Vercel Cron: runs at 10 AM daily

import { supabase } from '../supabase-admin.js';
import { sendEmail } from '../send-email.js';
import { sendWhatsApp } from '../send-whatsapp.js';
import { payoutAvailableEmail } from '../email.js';

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
    const now = new Date().toISOString();

    // Find delivered items where contest window has expired
    // - payout_status is 'delivered'
    // - contest_window_ends is in the past
    // - contest_status is NULL (no open contest)
    const { data: readyForPayout, error: queryError } = await supabase
      .from('transactions')
      .select(`
        id,
        product_title,
        seller_payout,
        seller_id,
        sellers (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('payout_status', 'delivered')
      .is('contest_status', null)
      .lt('contest_window_ends', now);

    if (queryError) {
      console.error('Error querying transactions:', queryError);
      return res.status(500).json({ error: 'Database error', details: queryError.message });
    }

    console.log(`Found ${readyForPayout?.length || 0} items ready for payout`);

    const results = {
      total: readyForPayout?.length || 0,
      processed: 0,
      notified: 0,
      errors: []
    };

    for (const transaction of readyForPayout || []) {
      const seller = transaction.sellers;

      try {
        // Update payout_status to 'available'
        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            payout_status: 'available',
            updated_at: now
          })
          .eq('id', transaction.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        results.processed++;
        console.log(`  ✅ Marked "${transaction.product_title}" as available for payout`);

        // Notify seller
        if (seller) {
          try {
            const metadata = { productTitle: transaction.product_title, payout: transaction.seller_payout };

            // Send WhatsApp
            if (seller.phone) {
              await sendWhatsApp({
                sellerId: seller.id,
                to: seller.phone,
                textBody: `💰 Payout Available!\n\nHi ${seller.name || 'there'}! Great news!\n\nYour sale of "${transaction.product_title}" is complete.\n\n$${transaction.seller_payout?.toFixed(0) || '0'} is now available for payout!\n\nWe'll send your payment within 5 business days.`,
                context: 'payout_available',
                metadata
              });
            }

            // Send email
            if (seller.email) {
              const { subject, html } = payoutAvailableEmail(seller.name, transaction.product_title, transaction.seller_payout);
              await sendEmail({
                sellerId: seller.id,
                to: seller.email,
                subject,
                html,
                context: 'payout_available',
                metadata
              });
            }

            results.notified++;
            console.log(`  📧 Notified ${seller.email} about available payout`);

          } catch (notifyErr) {
            console.error(`  Notification error:`, notifyErr.message);
          }
        }

      } catch (err) {
        console.error(`  Error processing ${transaction.id}:`, err.message);
        results.errors.push({ id: transaction.id, error: err.message });
      }
    }

    console.log(`✅ Payout processing complete: ${results.processed} processed, ${results.notified} notified`);

    return res.status(200).json({
      success: true,
      message: `Processed ${results.processed} payouts`,
      results
    });

  } catch (err) {
    console.error('Cron job error:', err);
    return res.status(500).json({ error: 'Cron job failed', message: err.message });
  }
}
