// api/order-webhook.js
// Dedicated Shopify "orders/paid" webhook handler.
//
// WHY a separate file: Vercel parses req.body to an object by default.
// Shopify HMAC must be verified against the ORIGINAL raw bytes — not a
// re-serialised JSON string. Setting bodyParser: false here lets us read
// the raw buffer, verify the signature correctly, then parse JSON ourselves.
//
// Shopify webhook URL: https://<your-domain>/api/order-webhook

import crypto from 'crypto';
import { fetchMetafields, getSellerEmail, getSellerId, getMetafieldValue } from '../lib/shopify-metafields.js';
import { sendEmail } from '../lib/send-email.js';
import { sendWhatsApp } from '../lib/send-whatsapp.js';
import { itemSoldInlineEmail } from '../lib/email.js';
import { supabase } from '../lib/supabase-admin.js';

// Disable Vercel's body parser so we receive the raw buffer for HMAC verification
export const config = { api: { bodyParser: false } };

// Read the full request body as a Buffer
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read request body:', err.message);
    return res.status(400).json({ error: 'Could not read body' });
  }

  // ── HMAC verification ───────────────────────────────────────────────────────
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmacHeader   = req.headers['x-shopify-hmac-sha256'];

  if (webhookSecret) {
    if (!hmacHeader) {
      console.error('Missing x-shopify-hmac-sha256 header');
      return res.status(401).json({ error: 'Missing HMAC header' });
    }

    const generatedHmac = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)          // raw Buffer — matches Shopify's original bytes
      .digest('base64');

    if (hmacHeader !== generatedHmac) {
      console.error('Invalid webhook HMAC signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    console.warn('⚠️  SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification');
  }

  // ── Parse order ─────────────────────────────────────────────────────────────
  let order;
  try {
    order = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Invalid JSON body:', err.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log(`💰 Order webhook received: ${order.name} (id: ${order.id})`);

  // Shopify expects a fast 200 — process in-line but respond quickly.
  // If processing is slow, consider offloading to a queue / background job.
  const results = [];

  for (const item of order.line_items || []) {
    const productId = item.product_id;
    if (!productId) continue;

    try {
      // ── Fetch seller info from Shopify metafields ──────────────────────────
      let sellerEmail   = null;
      let sellerId      = null;
      let sellerPayout  = null;
      let commissionRate = 18;
      let listingType   = 'regular';
      const productTitle = item.title;

      try {
        const metafields = await fetchMetafields(productId);
        sellerEmail    = getSellerEmail(metafields);
        sellerId       = getSellerId(metafields);
        sellerPayout   = parseFloat(getMetafieldValue(metafields, 'pricing', 'seller_payout')) || null;
        commissionRate = parseFloat(getMetafieldValue(metafields, 'pricing', 'commission_rate')) || 18;
        const listingTypeVal = getMetafieldValue(metafields, 'seller', 'listing_type');
        if (listingTypeVal) listingType = listingTypeVal;
      } catch (e) {
        console.warn(`Could not fetch metafields for product ${productId}:`, e.message);
      }

      // ── Resolve seller ─────────────────────────────────────────────────────
      let seller = null;
      if (sellerId) {
        const { data } = await supabase.from('sellers').select('*').eq('id', sellerId).single();
        seller = data;
      }
      if (!seller && sellerEmail) {
        const { data } = await supabase.from('sellers').select('*').eq('email', sellerEmail.toLowerCase()).single();
        seller = data;
      }

      const sellerMissing = !seller;
      if (sellerMissing) {
        console.warn(`⚠️  Seller not found for product ${productId} (email: ${sellerEmail}, id: ${sellerId})`);
      }

      // ── Idempotency: skip if transaction already exists ────────────────────
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('order_id', order.id.toString())
        .eq('product_id', productId.toString())
        .maybeSingle();

      if (existingTx) {
        console.log(`   Transaction already exists for order ${order.id} / product ${productId} — skipping`);
        continue;
      }

      // ── Calculate payout ───────────────────────────────────────────────────
      const salePrice = parseFloat(item.price);
      if (!sellerPayout) {
        sellerPayout = salePrice * ((100 - commissionRate) / 100);
      }

      // ── Buyer address ──────────────────────────────────────────────────────
      const buyerAddress = order.shipping_address ? {
        name:    order.shipping_address.name,
        street1: order.shipping_address.address1,
        street2: order.shipping_address.address2 || '',
        city:    order.shipping_address.city,
        state:   order.shipping_address.province_code,
        zip:     order.shipping_address.zip,
        country: order.shipping_address.country_code || 'US',
        phone:   order.shipping_address.phone || ''
      } : null;

      // ── Product image from line item ───────────────────────────────────────
      const productImage = item.image?.src || null;

      // ── Create transaction ─────────────────────────────────────────────────
      const now     = new Date();
      const shipBy  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { data: newTx, error: txError } = await supabase
        .from('transactions')
        .insert({
          seller_id:       seller?.id || null,
          order_id:        order.id.toString(),
          order_name:      order.name,
          product_id:      productId.toString(),
          product_title:   productTitle,
          product_image:   productImage,
          sale_price:      salePrice,
          seller_payout:   sellerPayout,
          commission_rate: commissionRate,
          status:          'pending_payout',
          payout_status:   sellerMissing ? 'needs_attention' : 'pending_shipping',
          shipping_status: sellerMissing ? 'needs_attention' : 'pending_label',
          listing_type:    listingType,
          customer_email:  order.email,
          buyer_address:   buyerAddress,
          ship_by:         shipBy.toISOString(),
          created_at:      now.toISOString(),
          admin_note:      sellerMissing
            ? `⚠️ SELLER NOT FOUND — email: ${sellerEmail || 'none'}, id: ${sellerId || 'none'}`
            : null
        })
        .select()
        .single();

      if (txError) {
        console.error(`   ❌ Failed to create transaction for product ${productId}:`, txError);
        continue;
      }

      if (sellerMissing) {
        console.log(`   ⚠️  Transaction created (needs_attention) for "${productTitle}" | No seller found`);

        // Alert admin so they can manually link the seller
        await sendEmail({
          to: process.env.ADMIN_EMAIL || 'thephirstory@gmail.com',
          subject: `⚠️ Order received — seller not found: ${productTitle}`,
          html: `<p>Order <strong>${order.name}</strong> was placed for <strong>${productTitle}</strong> but no seller could be matched.</p>
                 <p>Metafield email: ${sellerEmail || 'none'}<br>Metafield seller ID: ${sellerId || 'none'}</p>
                 <p>Please link the seller manually in the admin panel.</p>`,
          context: 'seller_missing'
        }).catch(e => console.error('Admin alert email failed:', e.message));

        results.push({ productId, payout: sellerPayout, sellerMissing: true });

      } else {
        console.log(`   ✅ Transaction created for "${productTitle}" | Seller: ${seller.email} | Payout: $${sellerPayout.toFixed(2)}`);

        // Notify seller
        await notifySellerOfSale(seller, { productTitle, salePrice, sellerPayout }).catch(e => {
          console.error('Seller notification failed:', e.message);
        });

        results.push({ sellerId: seller.id, productId, payout: sellerPayout });
      }

    } catch (err) {
      console.error(`   ❌ Error processing product ${productId}:`, err.message, err.stack);
    }
  }

  console.log(`✅ Order webhook done: ${order.name} — ${results.length} item(s) processed`);
  return res.status(200).json({ success: true, order: order.name, processed: results.length, results });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function notifySellerOfSale(seller, { productTitle, salePrice, sellerPayout }) {
  const metadata = { productTitle, salePrice, payout: sellerPayout };

  if (seller.phone) {
    await sendWhatsApp({
      sellerId: seller.id,
      to: seller.phone,
      template: 'item_sold',
      params: [productTitle, salePrice.toFixed(0)],
      context: 'item_sold',
      metadata,
      textPreview: `🎉 Your item "${productTitle}" sold for $${salePrice.toFixed(0)}! Your payout: $${sellerPayout.toFixed(0)}`
    });
  }

  if (seller.email) {
    const { subject, html } = itemSoldInlineEmail(seller.name, productTitle, salePrice, sellerPayout);
    await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'item_sold', metadata });
  }
}
