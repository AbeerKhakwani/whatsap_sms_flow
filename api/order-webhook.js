// api/order-webhook.js
// Shopify order webhook handler — handles orders/paid AND orders/cancelled.
//
// WHY a separate file: Vercel parses req.body to an object by default.
// Shopify HMAC must be verified against the ORIGINAL raw bytes — not a
// re-serialised JSON string. Setting bodyParser: false here lets us read
// the raw buffer, verify the signature correctly, then parse JSON ourselves.
//
// Register BOTH topics to the same URL in Shopify:
//   orders/paid      → https://<your-domain>/api/order-webhook
//   orders/cancelled → https://<your-domain>/api/order-webhook

import crypto from 'crypto';
import { fetchMetafields, getSellerEmail, getSellerId, getMetafieldValue } from '../lib/shopify-metafields.js';
import { getProduct } from '../lib/shopify.js';
import { sendEmail } from '../lib/send-email.js';
import { sendWhatsApp } from '../lib/send-whatsapp.js';
import { itemSoldInlineEmail, orderCancelledSellerEmail } from '../lib/email.js';
import { supabase } from '../lib/supabase-admin.js';
import { calculateSellerPayout, PLATFORM_FEE } from '../lib/payout-calculation.js';

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

  const topic = req.headers['x-shopify-topic'] || 'orders/paid';
  console.log(`📦 Order webhook received: ${order.name} (id: ${order.id}) topic: ${topic}`);

  // ── Route by topic ──────────────────────────────────────────────────────────
  if (topic === 'orders/cancelled') {
    await handleOrderCancelled(order);
    return res.status(200).json({ success: true, order: order.name, topic });
  }

  // Default: orders/paid
  // Shopify expects a fast 200 — process in-line but respond quickly.
  const results = [];

  for (const item of order.line_items || []) {
    const productId = item.product_id;
    if (!productId) continue;

    try {
      // ── Fetch seller info from Shopify metafields ──────────────────────────
      let sellerEmail   = null;
      let sellerId      = null;
      let sellerPayout   = null;
      let commissionRate = null; // null = not set in metafields, needs admin review
      let listingType    = 'regular';
      const productTitle = item.title;

      let isConcierge = false;
      try {
        const metafields = await fetchMetafields(productId);
        sellerEmail    = getSellerEmail(metafields);
        sellerId       = getSellerId(metafields);
        sellerPayout   = parseFloat(getMetafieldValue(metafields, 'pricing', 'seller_payout')) || null;
        const rateVal  = getMetafieldValue(metafields, 'pricing', 'commission_rate');
        commissionRate = rateVal ? parseFloat(rateVal) : null;
        const listingTypeVal = getMetafieldValue(metafields, 'seller', 'listing_type');
        if (listingTypeVal) listingType = listingTypeVal;
      } catch (e) {
        console.warn(`Could not fetch metafields for product ${productId}:`, e.message);
      }

      try {
        const product = await getProduct(productId, false);
        isConcierge = (product?.tags || '').split(',').map(t => t.trim()).includes('concierge');
      } catch (e) {
        console.warn(`Could not fetch product tags for ${productId}:`, e.message);
      }

      // The concierge tag is authoritative — keep listing_type in sync so reminders,
      // search, and the detail-page fulfill button all agree.
      if (isConcierge) listingType = 'concierge';

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
      // Subtract any order-level discount allocations (coupons, promo codes) from
      // the line item price to get what the buyer actually paid.
      const discountTotal = (item.discount_allocations || [])
        .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
      const salePrice = parseFloat(item.price) - discountTotal;
      // Only calculate payout if commission rate is known. If not, leave it null
      // so admin can set it manually before notifying the seller.
      const { commissionKnown, sellerPayout: computedPayout } = calculateSellerPayout({
        grossPrice: parseFloat(item.price),
        discount: discountTotal,
        commissionRate,
      });
      // Keep the precomputed metafield payout when there's no discount; otherwise
      // recompute through the shared formula.
      if (commissionKnown && (!sellerPayout || discountTotal > 0)) {
        sellerPayout = computedPayout;
      } else if (!commissionKnown) {
        sellerPayout = null;
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
          discount_amount: discountTotal,
          platform_fee:    PLATFORM_FEE,
          seller_payout:   sellerPayout,
          commission_rate: commissionRate,
          status:          'pending_payout',
          payout_status:   sellerMissing ? 'needs_attention' : (!commissionKnown ? 'needs_commission' : 'pending_shipping'),
          shipping_status: sellerMissing ? 'needs_attention' : (isConcierge ? 'concierge' : 'pending_label'),
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

      } else if (!commissionKnown) {
        console.log(`   ⚠️  Transaction created (needs commission) for "${productTitle}" | Seller: ${seller.email} | Commission rate not set`);
        results.push({ sellerId: seller.id, productId, payout: null, needsCommission: true });

      } else {
        console.log(`   ✅ Transaction created for "${productTitle}" | Seller: ${seller.email} | Payout: $${sellerPayout.toFixed(2)}`);

        // Notify seller
        await notifySellerOfSale(seller, { productTitle, salePrice, sellerPayout, commissionRate, discount: discountTotal }).catch(e => {
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

// ── Order cancelled ───────────────────────────────────────────────────────────

async function handleOrderCancelled(order) {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'thephirstory@gmail.com';

  for (const item of order.line_items || []) {
    const productId = item.product_id;
    const variantId = item.variant_id;

    try {
      // ── Find the transaction ────────────────────────────────────────────────
      const { data: tx } = await supabase
        .from('transactions')
        .select('*')
        .eq('order_id', order.id.toString())
        .eq('product_id', productId.toString())
        .maybeSingle();

      if (!tx) {
        console.warn(`⚠️  No transaction found for cancelled order ${order.name} / product ${productId}`);
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `⚠️ Cancelled order has no transaction: ${order.name}`,
          html: `<p>Shopify order <strong>${order.name}</strong> was cancelled but no matching transaction was found in the database.</p>
                 <p>Product ID: ${productId} | Variant ID: ${variantId}</p>
                 <p>Reason: ${order.cancel_reason || 'not specified'}</p>
                 <p>You may need to manually relist this item if it shows as sold out.</p>`,
          context: 'cancel_orphan'
        }).catch(() => {});
        continue;
      }

      // ── Check what we can auto-handle ───────────────────────────────────────
      const alreadyPaidOut   = tx.payout_status === 'paid';
      const inTransit        = ['shipped', 'delivered'].includes(tx.shipping_status);
      const hadLabel         = tx.shipping_status === 'label_created';

      if (alreadyPaidOut || inTransit) {
        const reason = alreadyPaidOut ? 'payout already sent to seller' : 'item already in transit';
        console.warn(`⚠️  Cannot auto-cancel ${order.name}: ${reason}`);
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `⚠️ Manual action needed — cancelled order: ${tx.product_title}`,
          html: `<p>Order <strong>${order.name}</strong> for <strong>${tx.product_title}</strong> was cancelled in Shopify but <strong>cannot be auto-resolved</strong>.</p>
                 <p><strong>Reason:</strong> ${reason}</p>
                 <p><strong>Current status:</strong> payout_status=${tx.payout_status}, shipping_status=${tx.shipping_status}</p>
                 <p>Please handle this manually — review the seller's payout and shipping situation.</p>`,
          context: 'cancel_manual_required'
        }).catch(() => {});
        continue;
      }

      // ── Auto-cancel ─────────────────────────────────────────────────────────
      await supabase.from('transactions').update({
        status:          'cancelled',
        payout_status:   'cancelled',
        shipping_status: 'cancelled',
        admin_note:      `Cancelled by Shopify on ${new Date(order.cancelled_at).toLocaleDateString()}. Reason: ${order.cancel_reason || 'not specified'}.${hadLabel ? ' ⚠️ Label was generated — void manually in Shippo.' : ''}`
      }).eq('id', tx.id);

      console.log(`✅ Transaction ${tx.id} marked cancelled for order ${order.name}`);

      // ── Relist item in Shopify (inventory +1) ───────────────────────────────
      if (variantId) {
        await relistItem(productId, variantId).catch(e => {
          console.warn(`⚠️  Could not relist item ${productId}:`, e.message);
        });
      }

      // ── Notify seller ───────────────────────────────────────────────────────
      if (tx.seller_id) {
        const { data: seller } = await supabase
          .from('sellers')
          .select('id, name, email, phone')
          .eq('id', tx.seller_id)
          .single();

        if (seller?.phone) {
          await sendWhatsApp({
            sellerId: seller.id,
            to: seller.phone,
            template: null,
            textPreview: `Hi${seller.name ? ` ${seller.name}` : ''}! The order for your item *${tx.product_title}* was cancelled by the buyer. Your item is back on sale on The Phir Story 🛍️ We'll let you know as soon as it sells again!`,
            context: 'order_cancelled',
            metadata: { productId, orderId: order.id.toString() }
          }).catch(e => console.error('Seller WhatsApp cancel failed:', e.message));
        }

        if (seller?.email) {
          const { subject, html } = orderCancelledSellerEmail(seller.name, tx.product_title);
          await sendEmail({
            sellerId: seller.id,
            to: seller.email,
            subject,
            html,
            context: 'order_cancelled',
            metadata: { productId, orderId: order.id.toString() }
          }).catch(e => console.error('Seller cancel email failed:', e.message));
        }
      }

      // ── Alert admin ─────────────────────────────────────────────────────────
      const labelNote = hadLabel
        ? `<p style="color:#dc2626;"><strong>⚠️ A shipping label was already generated for this item.</strong> Please void it manually in Shippo to avoid charges.</p>`
        : '';

      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `🚫 Order Cancelled — ${tx.product_title}`,
        html: `
          <p>Order <strong>${order.name}</strong> was cancelled in Shopify.</p>
          <table style="border-collapse:collapse;font-size:14px;margin:12px 0;">
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Item</td><td><strong>${tx.product_title}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Sale price</td><td>$${tx.sale_price?.toFixed(2) || '0.00'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Cancel reason</td><td>${order.cancel_reason || 'not specified'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Seller</td><td>${tx.seller_id ? `ID: ${tx.seller_id}` : 'unknown'}</td></tr>
          </table>
          ${labelNote}
          <p style="color:#16a34a;">✅ Item has been relisted in Shopify. Seller has been notified.</p>
        `,
        context: 'order_cancelled_admin'
      }).catch(() => {});

    } catch (err) {
      console.error(`❌ Error handling cancelled order for product ${productId}:`, err.message);
    }
  }
}

// ── Re-increment Shopify inventory so item shows as available again ────────────
async function relistItem(productId, variantId) {
  const SHOP  = process.env.VITE_SHOPIFY_STORE_URL;
  const TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

  // Get inventory_item_id from variant
  const vRes = await fetch(`https://${SHOP}/admin/api/2024-10/variants/${variantId}.json`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  });
  if (!vRes.ok) throw new Error(`Variant fetch failed: ${vRes.status}`);
  const { variant } = await vRes.json();
  const inventoryItemId = variant.inventory_item_id;
  if (!inventoryItemId) throw new Error('No inventory_item_id on variant');

  // Get inventory levels to find location
  const levelsRes = await fetch(
    `https://${SHOP}/admin/api/2024-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
    { headers: { 'X-Shopify-Access-Token': TOKEN } }
  );
  if (!levelsRes.ok) throw new Error(`Inventory levels fetch failed: ${levelsRes.status}`);
  const { inventory_levels } = await levelsRes.json();
  const level = inventory_levels?.[0];
  if (!level) throw new Error('No inventory level found');

  // Skip if already in stock (Shopify already re-incremented on its own)
  if ((level.available || 0) > 0) {
    console.log(`   Item already in stock (qty: ${level.available}) — skipping re-increment for product ${productId}`);
    return;
  }

  // Adjust +1
  const adjustRes = await fetch(`https://${SHOP}/admin/api/2024-10/inventory_levels/adjust.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location_id:          level.location_id,
      inventory_item_id:    inventoryItemId,
      available_adjustment: 1
    })
  });
  if (!adjustRes.ok) {
    const err = await adjustRes.text();
    throw new Error(`Inventory adjust failed: ${err}`);
  }
  console.log(`   ✅ Relisted product ${productId} — inventory +1`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function notifySellerOfSale(seller, { productTitle, salePrice, sellerPayout, commissionRate, discount = 0, platformFee = PLATFORM_FEE }) {
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
    const { subject, html } = itemSoldInlineEmail(seller.name, productTitle, { salePrice, discount, commissionRate, platformFee, sellerPayout });
    await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'item_sold', metadata });
  }
}
