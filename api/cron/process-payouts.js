// api/cron/process-payouts.js
// Daily cron job to process payouts after contest window expires
// Vercel Cron: runs at 10 AM daily

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
            // Send WhatsApp
            if (seller.phone && process.env.WHATSAPP_ACCESS_TOKEN) {
              let phone = seller.phone.replace(/\D/g, '');
              if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;

              const waMessage = `💰 Payout Available!\n\n` +
                `Hi ${seller.name || 'there'}! Great news!\n\n` +
                `Your sale of "${transaction.product_title}" is complete.\n\n` +
                `$${transaction.seller_payout?.toFixed(0) || '0'} is now available for payout!\n\n` +
                `We'll send your payment within 5 business days.`;

              await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: phone,
                  type: 'text',
                  text: { body: waMessage }
                })
              });
            }

            // Send email
            if (seller.email && process.env.RESEND_API_KEY) {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: 'The Phir Story <noreply@send.thephirstory.com>',
                  to: seller.email,
                  subject: `💰 Your payout is ready! - ${transaction.product_title}`,
                  html: `
                    <div style="font-family: sans-serif; max-width: 500px;">
                      <h1 style="color: #16a34a;">💰 Payout Available!</h1>
                      <p>Hi ${seller.name || 'there'},</p>
                      <p>Great news! Your sale of <strong>${transaction.product_title}</strong> is complete.</p>

                      <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <p style="margin: 0; font-size: 14px; color: #166534;">Available for payout</p>
                        <p style="margin: 8px 0 0; font-size: 32px; font-weight: bold; color: #16a34a;">$${transaction.seller_payout?.toFixed(2) || '0.00'}</p>
                      </div>

                      <p>We'll send your payment within 5 business days to your registered payment method.</p>

                      <a href="https://sell.thephirstory.com/seller/profile?tab=sales" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">View My Sales</a>
                    </div>
                  `
                })
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
