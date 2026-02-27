// api/cron/shipping-reminders.js
// Daily cron job to remind sellers to ship their items
// Vercel Cron: runs at 9 AM daily

import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../lib/send-email.js';
import { sendWhatsApp } from '../../lib/send-whatsapp.js';
import { shippingReminderEmail } from '../../lib/email.js';

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
    // Schedule: Day 3 (first reminder) + Day 4 (final reminder) after sale
    // Skip concierge items (admin ships those)
    // Max 2 reminders total
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const { data: pendingShipments, error: queryError } = await supabase
      .from('transactions')
      .select(`
        id,
        product_title,
        seller_payout,
        ship_by,
        reminder_count,
        listing_type,
        created_at,
        shipping_label_url,
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
      .neq('listing_type', 'concierge')
      .lt('reminder_count', 2)
      .lt('created_at', threeDaysAgo.toISOString())
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
      const isLastReminder = (shipment.reminder_count || 0) >= 1;
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
      if (isLastReminder) {
        urgencyText = '⚠️ FINAL REMINDER - ' + urgencyText;
      }

      const metadata = { productTitle: shipment.product_title, daysRemaining, isLastReminder };

      try {
        // Send WhatsApp reminder
        if (seller.phone) {
          const labelLine = shipment.shipping_label_url
            ? `Your label is ready! Print it from your dashboard.`
            : `Get your shipping label from your dashboard.`;
          const waMessage = `📦 Shipping Reminder${isLastReminder ? ' (Final)' : ''}\n\n` +
            `Hi ${seller.name || 'there'}! Please ship "${shipment.product_title}".\n\n` +
            `Ship by: ${shipByFormatted}\n` +
            `${urgencyText}\n\n` +
            `${labelLine}\n\n` +
            `💵 Your payout: $${shipment.seller_payout?.toFixed(0) || '0'}\n\n` +
            `Dashboard: https://sell.thephirstory.com/seller/profile?tab=sales`;

          await sendWhatsApp({
            sellerId: seller.id,
            to: seller.phone,
            textBody: waMessage,
            context: 'shipping_reminder',
            metadata
          });
        }

        // Send email reminder
        if (seller.email) {
          const dashboardUrl = 'https://sell.thephirstory.com/seller/profile?tab=sales';
          const { subject, html } = shippingReminderEmail(seller.name, shipment.product_title, daysRemaining, dashboardUrl);
          await sendEmail({
            sellerId: seller.id,
            to: seller.email,
            subject,
            html,
            context: 'shipping_reminder',
            metadata
          });
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
