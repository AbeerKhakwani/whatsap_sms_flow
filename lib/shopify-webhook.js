// lib/shopify-webhook.js
// Shopify webhook handler - to be integrated into an API endpoint
// when we upgrade from Hobby plan or consolidate APIs

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getProduct } from './shopify.js';

/**
 * Verify Shopify webhook HMAC signature
 */
export function verifyWebhookSignature(rawBody, hmacHeader, secret) {
  if (!secret || !hmacHeader) return false;

  const generatedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  return hmacHeader === generatedHmac;
}

/**
 * Process order paid webhook - create transactions and notify sellers
 */
export async function handleOrderPaid(order, supabase) {
  console.log(`💰 Processing paid order: ${order.name}`);
  const results = [];

  for (const item of order.line_items || []) {
    const productId = item.product_id;
    if (!productId) continue;

    try {
      // Get product with metafields to find seller info
      const product = await getProduct(productId);
      const metafields = product.metafields || [];

      // Extract seller info from metafields
      let sellerEmail = null;
      let sellerId = null;
      let sellerPayout = null;
      let commissionRate = 18;

      for (const mf of metafields) {
        if (mf.namespace === 'seller' && mf.key === 'email') sellerEmail = mf.value;
        if (mf.namespace === 'seller' && mf.key === 'id') sellerId = mf.value;
        if (mf.namespace === 'pricing' && mf.key === 'seller_payout') sellerPayout = parseFloat(mf.value);
        if (mf.namespace === 'pricing' && mf.key === 'commission_rate') commissionRate = parseFloat(mf.value);
      }

      if (!sellerEmail && !sellerId) {
        console.log(`   Skipping product ${productId} - no seller info`);
        continue;
      }

      // Find seller in database
      let seller = null;
      if (sellerId) {
        const { data } = await supabase.from('sellers').select('*').eq('id', sellerId).single();
        seller = data;
      } else if (sellerEmail) {
        const { data } = await supabase.from('sellers').select('*').eq('email', sellerEmail.toLowerCase()).single();
        seller = data;
      }

      if (!seller) {
        console.log(`   Seller not found for product ${productId}`);
        continue;
      }

      // Check if transaction already exists
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('order_id', order.id.toString())
        .eq('product_id', productId.toString())
        .single();

      if (existingTx) {
        console.log(`   Transaction already exists for order ${order.id}, product ${productId}`);
        continue;
      }

      // Calculate ship-by deadline (7 days from now)
      const shipBy = new Date();
      shipBy.setDate(shipBy.getDate() + 7);

      // Extract buyer address from order
      const shippingAddr = order.shipping_address || {};
      const buyerAddress = shippingAddr.address1 ? {
        name: shippingAddr.name || `${shippingAddr.first_name || ''} ${shippingAddr.last_name || ''}`.trim(),
        street1: shippingAddr.address1,
        street2: shippingAddr.address2 || '',
        city: shippingAddr.city,
        state: shippingAddr.province_code,
        zip: shippingAddr.zip,
        country: shippingAddr.country_code || 'US',
        phone: shippingAddr.phone || ''
      } : null;

      // Create transaction record
      const transaction = {
        seller_id: seller.id,
        order_id: order.id.toString(),
        order_name: order.name,
        product_id: productId.toString(),
        product_title: item.title || product.title,
        sale_price: parseFloat(item.price),
        seller_payout: sellerPayout || parseFloat(item.price) * 0.82,
        commission_rate: commissionRate,
        status: 'pending_payout',
        payout_status: 'pending_shipping',
        shipping_status: 'pending_label',
        ship_by: shipBy.toISOString(),
        buyer_address: buyerAddress,
        customer_email: order.email,
        created_at: new Date().toISOString()
      };

      const { error: txError } = await supabase.from('transactions').insert(transaction);

      if (txError) {
        console.error(`   Failed to create transaction:`, txError);
        continue;
      }

      console.log(`   ✅ Created transaction for ${item.title} | Seller: ${seller.email} | Payout: $${transaction.seller_payout}`);

      results.push({ seller, transaction, product: item });

    } catch (err) {
      console.error(`   Error processing product ${productId}:`, err.message);
    }
  }

  return results;
}

/**
 * Send sale notification to seller
 */
export async function notifySeller(seller, saleInfo, config) {
  const { productTitle, salePrice, sellerPayout, shipBy } = saleInfo;
  const { whatsappToken, whatsappPhoneId, resendKey } = config;

  // Format ship-by date
  const shipByDate = shipBy ? new Date(shipBy).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }) : '7 days';

  const message = `🎉 Your item sold!\n\n` +
    `"${productTitle}" just sold for $${salePrice.toFixed(0)}!\n\n` +
    `💵 Your payout: $${sellerPayout.toFixed(0)}\n\n` +
    `📦 Please ship by ${shipByDate}\n` +
    `Get your shipping label: https://sell.thephirstory.com/seller/profile?tab=sales`;

  // Send WhatsApp
  if (seller.phone && whatsappToken && whatsappPhoneId) {
    try {
      let phone = seller.phone.replace(/\D/g, '');
      if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;

      await fetch(`https://graph.facebook.com/v18.0/${whatsappPhoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: message }
        })
      });
      console.log(`   📱 WhatsApp sent to ${seller.phone}`);
    } catch (err) {
      console.error(`   WhatsApp failed:`, err.message);
    }
  }

  // Send email
  if (seller.email && resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'The Phir Story <noreply@send.thephirstory.com>',
          to: seller.email,
          subject: `🎉 Your item sold! - ${productTitle}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px;">
              <h1 style="color: #16a34a;">🎉 Congratulations${seller.name ? `, ${seller.name}` : ''}!</h1>
              <p>Your item <strong>${productTitle}</strong> just sold for $${salePrice.toFixed(2)}!</p>
              <p style="font-size: 24px; color: #16a34a;"><strong>Your payout: $${sellerPayout.toFixed(2)}</strong></p>

              <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold;">📦 Ship by ${shipByDate}</p>
                <p style="margin: 8px 0 0;">Get your prepaid shipping label from your dashboard.</p>
              </div>

              <a href="https://sell.thephirstory.com/seller/profile?tab=sales" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Get Shipping Label</a>

              <p style="color: #666; font-size: 14px; margin-top: 20px;">Once the buyer receives the item, your payout will be processed within 3-5 business days.</p>
            </div>
          `
        })
      });
      console.log(`   📧 Email sent to ${seller.email}`);
    } catch (err) {
      console.error(`   Email failed:`, err.message);
    }
  }
}
