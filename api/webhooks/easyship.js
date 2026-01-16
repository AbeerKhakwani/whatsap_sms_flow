// api/webhooks/easyship.js
// Webhook handler for Easyship tracking updates
// Configure in Easyship dashboard: Settings > Webhooks

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook signature if secret is configured
  const webhookSecret = process.env.EASYSHIP_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['x-easyship-signature'];
    // TODO: Implement signature verification if needed
  }

  const event = req.body;
  console.log('📦 Easyship webhook received:', event.event_type);

  try {
    const eventType = event.event_type;
    const shipment = event.shipment || event.data?.shipment;

    if (!shipment) {
      console.log('No shipment data in webhook');
      return res.status(200).json({ received: true });
    }

    const trackingNumber = shipment.tracking_number;
    const trackingStatus = shipment.tracking_status || shipment.trackings?.[0]?.status;

    if (!trackingNumber) {
      console.log('No tracking number in webhook');
      return res.status(200).json({ received: true });
    }

    console.log(`📦 Tracking update: ${trackingNumber} → ${trackingStatus}`);

    // Find the transaction by tracking number
    const { data: transaction, error: findError } = await supabase
      .from('transactions')
      .select('id, seller_id, product_title, seller_payout, payout_status, sellers(name, email, phone)')
      .eq('tracking_number', trackingNumber)
      .single();

    if (findError || !transaction) {
      console.log(`No transaction found for tracking: ${trackingNumber}`);
      return res.status(200).json({ received: true, message: 'No matching transaction' });
    }

    // Map Easyship status to our status
    let updates = {};
    let shouldNotify = false;

    switch (trackingStatus?.toLowerCase()) {
      case 'in_transit':
      case 'out_for_delivery':
        updates = {
          shipping_status: 'shipped',
          payout_status: 'in_transit'
        };
        break;

      case 'delivered':
        // Start 3-day contest window
        const contestWindowEnds = new Date();
        contestWindowEnds.setDate(contestWindowEnds.getDate() + 3);

        updates = {
          shipping_status: 'delivered',
          payout_status: 'delivered',
          delivered_at: new Date().toISOString(),
          contest_window_ends: contestWindowEnds.toISOString()
        };
        shouldNotify = true;
        break;

      case 'exception':
      case 'failure':
        // Log but don't change status - admin will handle
        console.log(`⚠️ Tracking exception for ${trackingNumber}: ${trackingStatus}`);
        break;

      default:
        console.log(`Unknown tracking status: ${trackingStatus}`);
    }

    // Update transaction if we have updates
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('Failed to update transaction:', updateError);
      } else {
        console.log(`✅ Transaction ${transaction.id} updated: ${JSON.stringify(updates)}`);
      }
    }

    // Notify seller on delivery
    if (shouldNotify && transaction.sellers) {
      const seller = transaction.sellers;
      const contestWindowEnds = new Date();
      contestWindowEnds.setDate(contestWindowEnds.getDate() + 3);
      const contestDate = contestWindowEnds.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      // Send WhatsApp
      if (seller.phone && process.env.WHATSAPP_ACCESS_TOKEN) {
        try {
          let phone = seller.phone.replace(/\D/g, '');
          if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;

          const waMessage = `📬 Item Delivered!\n\n` +
            `Hi ${seller.name || 'there'}! Great news!\n\n` +
            `"${transaction.product_title}" was delivered to the buyer.\n\n` +
            `💵 Your payout: $${transaction.seller_payout?.toFixed(0) || '0'}\n\n` +
            `After a 3-day review period (by ${contestDate}), your payment will be processed.`;

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
          console.log(`📱 Delivery notification sent to ${seller.phone}`);
        } catch (waErr) {
          console.error('WhatsApp delivery notification failed:', waErr.message);
        }
      }

      // Send email
      if (seller.email && process.env.RESEND_API_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'The Phir Story <noreply@send.thephirstory.com>',
              to: seller.email,
              subject: `📬 Delivered! - ${transaction.product_title}`,
              html: `
                <div style="font-family: sans-serif; max-width: 500px;">
                  <h1 style="color: #16a34a;">📬 Item Delivered!</h1>
                  <p>Hi ${seller.name || 'there'},</p>
                  <p>Great news! Your item <strong>${transaction.product_title}</strong> was delivered to the buyer.</p>

                  <div style="background: #dbeafe; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; font-weight: bold;">Payout: $${transaction.seller_payout?.toFixed(2) || '0.00'}</p>
                    <p style="margin: 8px 0 0; color: #1e40af;">After a 3-day review period (by ${contestDate}), your payment will be processed.</p>
                  </div>

                  <p style="color: #666; font-size: 14px;">If there are no issues reported by the buyer, your funds will become available for payout automatically.</p>

                  <a href="https://sell.thephirstory.com/seller/profile?tab=sales" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">View My Sales</a>
                </div>
              `
            })
          });
          console.log(`📧 Delivery notification email sent to ${seller.email}`);
        } catch (emailErr) {
          console.error('Email delivery notification failed:', emailErr.message);
        }
      }
    }

    return res.status(200).json({
      received: true,
      trackingNumber,
      status: trackingStatus,
      updated: Object.keys(updates).length > 0
    });

  } catch (err) {
    console.error('Easyship webhook error:', err);
    // Return 200 to prevent retries
    return res.status(200).json({ received: true, error: err.message });
  }
}
