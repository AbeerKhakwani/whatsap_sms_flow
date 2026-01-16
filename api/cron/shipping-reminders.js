// api/cron/shipping-reminders.js
// Daily cron job to remind sellers to ship their items
// Vercel Cron: runs at 9 AM daily

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Verify this is a cron request (Vercel adds this header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without auth
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('📦 Running shipping reminders cron job...');

  try {
    // Find transactions that need shipping reminders
    // - payout_status is pending_shipping
    // - shipping_status is pending_label or label_created (not actually shipped)
    // - last_reminder_sent is null OR more than 24 hours ago
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data: pendingShipments, error: queryError } = await supabase
      .from('transactions')
      .select(`
        id,
        product_title,
        seller_payout,
        ship_by,
        reminder_count,
        seller_id,
        sellers (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('payout_status', 'pending_shipping')
      .in('shipping_status', ['pending_label', 'label_created'])
      .or(`last_reminder_sent.is.null,last_reminder_sent.lt.${oneDayAgo.toISOString()}`);

    if (queryError) {
      console.error('Error querying transactions:', queryError);
      return res.status(500).json({ error: 'Database error', details: queryError.message });
    }

    console.log(`Found ${pendingShipments?.length || 0} items needing shipping reminders`);

    const results = {
      total: pendingShipments?.length || 0,
      sent: 0,
      failed: 0,
      errors: []
    };

    for (const shipment of pendingShipments || []) {
      const seller = shipment.sellers;
      if (!seller) {
        console.log(`  Skipping ${shipment.id} - no seller found`);
        continue;
      }

      // Calculate days remaining
      const shipBy = shipment.ship_by ? new Date(shipment.ship_by) : null;
      const now = new Date();
      const daysRemaining = shipBy ? Math.ceil((shipBy - now) / (1000 * 60 * 60 * 24)) : null;

      // Format ship-by date
      const shipByFormatted = shipBy ? shipBy.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }) : 'soon';

      // Determine urgency
      let urgencyText = '';
      if (daysRemaining !== null) {
        if (daysRemaining <= 0) {
          urgencyText = '⚠️ OVERDUE - Please ship immediately!';
        } else if (daysRemaining === 1) {
          urgencyText = '⏰ Last day to ship!';
        } else {
          urgencyText = `${daysRemaining} days remaining`;
        }
      }

      try {
        // Send WhatsApp reminder
        if (seller.phone && process.env.WHATSAPP_ACCESS_TOKEN) {
          let phone = seller.phone.replace(/\D/g, '');
          if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;

          const waMessage = `📦 Shipping Reminder\n\n` +
            `Hi ${seller.name || 'there'}! Please ship "${shipment.product_title}".\n\n` +
            `Ship by: ${shipByFormatted}\n` +
            `${urgencyText}\n\n` +
            `💵 Your payout: $${shipment.seller_payout?.toFixed(0) || '0'}\n\n` +
            `Get your label: https://sell.thephirstory.com/seller/profile?tab=sales`;

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
          console.log(`  📱 WhatsApp sent to ${seller.phone} for "${shipment.product_title}"`);
        }

        // Send email reminder
        if (seller.email && process.env.RESEND_API_KEY) {
          const emailSubject = daysRemaining <= 0
            ? `⚠️ Overdue: Please ship "${shipment.product_title}"`
            : `📦 Reminder: Ship "${shipment.product_title}" by ${shipByFormatted}`;

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'The Phir Story <noreply@send.thephirstory.com>',
              to: seller.email,
              subject: emailSubject,
              html: `
                <div style="font-family: sans-serif; max-width: 500px;">
                  <h2>📦 Shipping Reminder</h2>
                  <p>Hi ${seller.name || 'there'},</p>
                  <p>Please ship your item: <strong>${shipment.product_title}</strong></p>

                  <div style="background: ${daysRemaining <= 0 ? '#fee2e2' : '#fef3c7'}; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; font-weight: bold;">Ship by: ${shipByFormatted}</p>
                    <p style="margin: 8px 0 0; color: ${daysRemaining <= 0 ? '#dc2626' : '#92400e'};">${urgencyText}</p>
                  </div>

                  <p style="font-size: 18px; color: #16a34a;"><strong>Your payout: $${shipment.seller_payout?.toFixed(2) || '0.00'}</strong></p>

                  <a href="https://sell.thephirstory.com/seller/profile?tab=sales" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Get Shipping Label</a>
                </div>
              `
            })
          });
          console.log(`  📧 Email sent to ${seller.email} for "${shipment.product_title}"`);
        }

        // Update reminder tracking
        await supabase
          .from('transactions')
          .update({
            last_reminder_sent: new Date().toISOString(),
            reminder_count: (shipment.reminder_count || 0) + 1
          })
          .eq('id', shipment.id);

        results.sent++;

      } catch (err) {
        console.error(`  Error sending reminder for ${shipment.id}:`, err.message);
        results.failed++;
        results.errors.push({ id: shipment.id, error: err.message });
      }
    }

    console.log(`✅ Shipping reminders complete: ${results.sent} sent, ${results.failed} failed`);

    return res.status(200).json({
      success: true,
      message: `Sent ${results.sent} reminders`,
      results
    });

  } catch (err) {
    console.error('Cron job error:', err);
    return res.status(500).json({ error: 'Cron job failed', message: err.message });
  }
}
