// api/admin-listings.js
// Consolidated admin listing actions: get-pending, approve, reject

import { approveDraft, getProduct, deleteProduct, getPendingDrafts, getProductCounts, updateProduct, createDraft, fulfillOrder } from '../lib/shopify.js';
import { listingApprovedEmail, payoutNotificationEmail, listingRejectedEmail, listingRevisionEmail, salePriceConfirmedEmail } from '../lib/email.js';
import { sendEmail } from '../lib/send-email.js';
import { sendWhatsApp } from '../lib/send-whatsapp.js';
import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';
import { fetchMetafields, getSellerEmail, getSellerId, getMetafieldValue, extractPricing, upsertMetafield } from '../lib/shopify-metafields.js';
import { resolveSellerFromProduct } from '../lib/seller-lookup.js';
import { addProductToSeller } from '../lib/sellers.js';
import { scrapePage } from '../lib/scraper.js';
import { withCache, cacheBust } from '../lib/cache.js';
import { calculateSellerPayout, PLATFORM_FEE } from '../lib/payout-calculation.js';
import { payViaProvider, releasePayout } from '../lib/payout-service.js';

const CACHE_PENDING = 'listings:pending';
const CACHE_ALL = 'listings:all';

const STORE_URL = process.env.VITE_SHOPIFY_STORE_URL?.replace('.myshopify.com', '');

/**
 * Send a WhatsApp interactive Flow message for the revision update form.
 * Uses `flow_action: data_exchange` so our whatsapp-flow endpoint receives the
 * screen init call and echoes back the field-visibility data.
 * Template message must have been sent first to open the 24 h session window.
 */
async function sendRevisionFlowMessage(phone, productTitle, note, productId, flowId, screenData) {
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!TOKEN || !PHONE_ID) return;

  let cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone.startsWith('1') && cleanPhone.length === 10) cleanPhone = '1' + cleanPhone;

  const payload = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Update Your Listing' },
      body: {
        text: `Tap below to update the requested fields for *${productTitle}* directly here in WhatsApp.`
      },
      footer: { text: 'The Phir Story' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `rev_${productId}`,
          flow_id: flowId,
          flow_cta: 'Update Listing',
          flow_action: 'data_exchange',
          flow_action_payload: {
            screen: 'REVISION',
            data: screenData
          }
        }
      }
    }
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('❌ Revision flow message failed:', JSON.stringify(data));
    } else {
      console.log('📱 Revision flow message sent:', data?.messages?.[0]?.id);
    }
  } catch (e) {
    console.error('❌ Revision flow message crashed:', e.message);
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const { action } = req.query;

  try {
    // GET PENDING LISTINGS
    if (action === 'pending' && req.method === 'GET') {
      const [products, counts, { count: soldCount }] = await Promise.all([
        getPendingDrafts(),
        getProductCounts(),
        supabase.from('transactions').select('*', { count: 'exact', head: true })
      ]);

      // Fetch metafields for all products to get seller info (cache 2 min)
      const listingsWithSeller = await withCache(CACHE_PENDING, 120, async () => Promise.all(products.map(async (product) => {
        const variant = product.variants?.[0] || {};
        const tags = product.tags?.split(', ') || [];

        // Fetch metafields to get seller email + pricing
        const metafields = await fetchMetafields(product.id);
        const sellerEmail = getSellerEmail(metafields);
        const sellerId = getSellerId(metafields);
        const { commissionRate, sellerAskingPrice, sellerPayout } = extractPricing(metafields, variant.price);

        // Find seller in DB (try ID, email, then product ID fallback)
        const seller = await resolveSellerFromProduct(sellerEmail, sellerId, product.id, 'id, name, email, phone');

        return {
          id: product.id,
          shopify_product_id: product.id,
          product_name: product.title,
          designer: product.vendor || 'Unknown Designer',
          size: variant.option1 || 'One Size',
          condition: variant.option3 || 'Good',
          list_price: parseFloat(variant.price) || 0,       // what buyer pays (asking + $10 fee)
          asking_price_usd: sellerAskingPrice || 0,          // what seller wants (used throughout UI)
          seller_payout: sellerPayout,
          commission_rate: commissionRate,
          description: product.body_html?.replace(/<[^>]*>/g, ' ').trim() || '',
          images: product.images?.map(img => img.src) || [],
          created_at: product.created_at,
          shopify_admin_url: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`,
          tags,
          seller: seller ? {
            id: seller.id,
            name: seller.name,
            email: seller.email,
            phone: seller.phone
          } : null
        };
      })));

      return res.status(200).json({
        success: true,
        listings: listingsWithSeller,
        stats: {
          pending: listingsWithSeller.length,
          approved: counts.active || 0,
          sold: soldCount || 0
        }
      });
    }

    // APPROVE LISTING
    if (action === 'approve' && req.method === 'POST') {
      const { shopifyProductId, skipNotification } = req.body;

      if (!shopifyProductId) {
        return res.status(400).json({ error: 'Please provide shopifyProductId' });
      }

      const productBefore = await getProduct(shopifyProductId);

      // Only activate + notify — no data overwrites (admin edits in Shopify directly)
      const product = await approveDraft(shopifyProductId);

      // Get seller email + payout from metafields
      let sellerEmail = getSellerEmail(productBefore.metafields);
      const sellerIdMF = getSellerId(productBefore.metafields);
      const pricing = extractPricing(productBefore.metafields, productBefore.variants?.[0]?.price);
      const sellerPayout = pricing.sellerPayout;
      const productUrl = `https://${STORE_URL}.com/products/${product.handle}`;

      // Find seller in DB (try ID, email, then product ID fallback)
      const seller = await resolveSellerFromProduct(sellerEmail, sellerIdMF, shopifyProductId);
      if (seller && !sellerEmail) sellerEmail = seller.email;

      if (!skipNotification && sellerEmail) {
        const sellerId = seller?.id;
        const metadata = { productId: product.id, productTitle: product.title, payout: sellerPayout };

        // Send email
        const { subject, html } = listingApprovedEmail(seller?.name, product.title, productUrl, sellerPayout);
        await sendEmail({ sellerId, to: sellerEmail, subject, html, context: 'listing_approved', metadata });

        // Send WhatsApp — template vars: {{1}}=name, {{2}}=title, {{3}}=payout
        if (seller?.phone) {
          await sendWhatsApp({
            sellerId,
            to: seller.phone,
            template: 'listing_approved',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: seller.name || 'there' },
                  { type: 'text', text: product.title },
                  { type: 'text', text: sellerPayout?.toFixed(2) || '0.00' }
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: product.handle }]
              }
            ],
            context: 'listing_approved',
            metadata,
            textPreview: `Your listing "${product.title}" is now live on The Phir Story!`
          });
        }
      }

      await cacheBust(CACHE_PENDING, CACHE_ALL);
      return res.status(200).json({
        success: true,
        productId: product.id,
        productUrl,
        notificationSent: !skipNotification && !!sellerEmail
      });
    }

    // TOGGLE CONCIERGE TAG
    if (action === 'toggle-concierge' && req.method === 'POST') {
      const { shopifyProductId } = req.body;
      if (!shopifyProductId) {
        return res.status(400).json({ error: 'shopifyProductId required' });
      }

      const product = await getProduct(shopifyProductId, false);
      const tags = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      const wasConcierge = tags.includes('concierge');
      const nextTags = wasConcierge
        ? tags.filter(t => t !== 'concierge')
        : [...tags, 'concierge'];

      await updateProduct(shopifyProductId, { tags: nextTags.join(', ') });

      // Sync open transactions so the seller dashboard reflects the change immediately.
      // pending_label <-> concierge only; don't touch label_created/shipped/delivered.
      if (wasConcierge) {
        await supabase
          .from('transactions')
          .update({ shipping_status: 'pending_label' })
          .eq('product_id', shopifyProductId.toString())
          .eq('shipping_status', 'concierge');
      } else {
        await supabase
          .from('transactions')
          .update({ shipping_status: 'concierge' })
          .eq('product_id', shopifyProductId.toString())
          .eq('shipping_status', 'pending_label');
      }

      // Bust seller listing caches so their dashboard shows the right badge
      const sellerEmail = getSellerEmail(product.metafields) || (await resolveSellerFromProduct(null, getSellerId(product.metafields), shopifyProductId))?.email;
      if (sellerEmail) {
        await cacheBust(`listings:seller:${sellerEmail.toLowerCase()}`);
      }
      await cacheBust(CACHE_PENDING, CACHE_ALL);

      return res.status(200).json({
        success: true,
        concierge: !wasConcierge,
        tags: nextTags
      });
    }

    // REJECT LISTING
    if (action === 'reject' && req.method === 'POST') {
      const { shopifyProductId, reason, note, skipNotification } = req.body;

      if (!shopifyProductId) {
        return res.status(400).json({ error: 'Please provide shopifyProductId' });
      }

      // Get product info before deleting
      const productBefore = await getProduct(shopifyProductId);
      const productTitle = productBefore.title;
      const variant = productBefore.variants?.[0] || {};
      const productTags = productBefore.tags || '';

      // Find seller from metafields + DB lookup
      let sellerEmail = getSellerEmail(productBefore.metafields);
      const sellerIdMF = getSellerId(productBefore.metafields);
      const seller = await resolveSellerFromProduct(sellerEmail, sellerIdMF, shopifyProductId);
      if (seller && !sellerEmail) sellerEmail = seller.email;

      // Extract pricing from metafields
      const { sellerPayout } = extractPricing(productBefore.metafields, variant.price);

      // Extract source from tags
      const sourceTag = productTags.split(',').map(t => t.trim()).find(t => t.startsWith('source:'));
      const submissionSource = sourceTag ? sourceTag.replace('source:', '') : 'unknown';

      // Collect image URLs before deletion
      const imageUrls = (productBefore.images || []).map(img => ({
        src: img.src,
        alt: img.alt || '',
        position: img.position
      }));

      // Save rejected listing data to Supabase BEFORE deleting from Shopify
      try {
        await supabase.from('rejected_listings').insert({
          seller_id: seller?.id || null,
          shopify_product_id: shopifyProductId.toString(),
          title: productTitle,
          designer: productBefore.vendor || null,
          item_type: productBefore.product_type || null,
          size: variant.option1 || null,
          condition: productTags.split(',').map(t => t.trim()).find(t =>
            ['new', 'like new', 'gently used', 'used', 'fair'].includes(t.toLowerCase())
          ) || null,
          asking_price: variant.price ? parseFloat(variant.price) : null,
          listing_price: sellerPayout || null,
          images: imageUrls,
          rejection_reason: reason || null,
          rejection_note: note || null,
          submission_source: submissionSource,
          original_tags: productTags
        });
        console.log('📋 Rejected listing saved to DB');
      } catch (saveErr) {
        console.error('Failed to save rejected listing (non-fatal):', saveErr);
      }

      // Delete the draft from Shopify
      await deleteProduct(shopifyProductId);

      // Send notifications if we found the seller
      if (!skipNotification && seller && reason) {
        const metadata = { productId: shopifyProductId, productTitle, reason, note };

        // Send email
        const { subject, html } = listingRejectedEmail(seller.name, productTitle, reason, note || null);
        await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'listing_rejected', metadata });

        // Send WhatsApp (utility template with Submit New Listing button)
        if (seller.phone && !seller.phone.startsWith('NOPHONE') && !seller.phone.startsWith('RESET_')) {
          await sendWhatsApp({
            sellerId: seller.id,
            to: seller.phone,
            template: 'listing_rejected_v2',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: seller.name || 'there' },
                  { type: 'text', text: productTitle },
                  { type: 'text', text: reason }
                ]
              }
            ],
            context: 'listing_rejected',
            metadata,
            textPreview: `Your listing "${productTitle}" was not approved. Reason: ${reason}`
          });
        }
      }

      await cacheBust(CACHE_PENDING, CACHE_ALL);
      return res.status(200).json({
        success: true,
        message: 'Listing rejected and notifications sent',
        notificationSent: !skipNotification && !!seller
      });
    }

    // REQUEST REVISION — keep draft alive, tag as needs-revision, notify seller
    if (action === 'request-revision' && req.method === 'POST') {
      const { shopifyProductId, note, fields, skipNotification } = req.body;

      if (!shopifyProductId || !note) {
        return res.status(400).json({ error: 'shopifyProductId and note required' });
      }

      const product = await getProduct(shopifyProductId);
      const metafields = await fetchMetafields(shopifyProductId);
      const sellerEmail = getSellerEmail(metafields);
      const sellerId = getSellerId(metafields);

      // Swap tags: remove pending-approval + seller-revised, add needs-revision
      const currentTags = product.tags?.split(', ').map(t => t.trim()).filter(Boolean) || [];
      const newTags = [
        ...currentTags.filter(t => t !== 'pending-approval' && t !== 'seller-revised'),
        'needs-revision'
      ];
      await updateProduct(shopifyProductId, { tags: newTags.join(', ') });

      // Store revision note + fields as metafields so seller portal can display them
      await upsertMetafield(shopifyProductId, metafields, 'custom', 'revision_note', note, 'multi_line_text_field');
      await upsertMetafield(shopifyProductId, metafields, 'custom', 'revision_requested_at', new Date().toISOString(), 'single_line_text_field');
      if (fields?.length) await upsertMetafield(shopifyProductId, metafields, 'custom', 'revision_fields', JSON.stringify(fields), 'json');
      if (sellerEmail) await cacheBust(`listings:seller:${sellerEmail}`);

      const seller = await resolveSellerFromProduct(sellerEmail, sellerId, shopifyProductId, 'id, name, email, phone');

      let notificationSent = false;
      if (!skipNotification && seller) {
        const portalUrl = `https://sell.thephirstory.com/seller`;
        const metadata = { productId: shopifyProductId, productTitle: product.title, note };

        // Email
        if (seller.email) {
          const { subject, html } = listingRevisionEmail(seller.name, product.title, note, portalUrl);
          await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'revision_requested', metadata });
        }

        // WhatsApp — template: listing_revision_requested ({{1}}=name, {{2}}=title, {{3}}=note)
        // The template re-opens the 24h session window so we can immediately follow with a Flow message.
        if (seller.phone) {
          await sendWhatsApp({
            sellerId: seller.id,
            to: seller.phone,
            template: 'listing_revision_requested',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: seller.name || 'there' },
                  { type: 'text', text: product.title },
                  { type: 'text', text: note }
                ]
              }
            ],
            context: 'revision_requested',
            metadata,
            textPreview: `Revision requested for "${product.title}": ${note}`
          });

          // If a Flow ID is configured, send an interactive flow message so the seller
          // can update the exact requested fields directly inside WhatsApp.
          const REVISION_FLOW_ID = process.env.WHATSAPP_REVISION_FLOW_ID;
          if (REVISION_FLOW_ID) {
            // Build visibility flags from the selected fields array
            const fieldSet = new Set(fields || []);
            const flowScreenData = {
              product_id:         shopifyProductId.toString(),
              product_title:      product.title,
              revision_note:      note,
              current_price:      String(getMetafieldValue(metafields, 'pricing', 'seller_asking_price') || ''),
              show_photos:        fieldSet.has('photos'),
              show_price:         fieldSet.has('price'),
              show_designer:      fieldSet.has('designer'),
              show_measurements:  fieldSet.has('measurements'),
              show_description:   fieldSet.has('description'),
              show_title:         fieldSet.has('title')
            };

            // Fallback: if no fields provided, show all
            if (!fields?.length) {
              Object.keys(flowScreenData).forEach(k => { if (k.startsWith('show_')) flowScreenData[k] = true; });
            }

            await sendRevisionFlowMessage(seller.phone, product.title, note, shopifyProductId, REVISION_FLOW_ID, flowScreenData);
          }
        }
        notificationSent = true;
      }

      await cacheBust(CACHE_PENDING, CACHE_ALL);
      return res.status(200).json({ success: true, notificationSent });
    }

    // GET PENDING PAYOUTS
    if (action === 'payouts' && req.method === 'GET') {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending_payout')
        .order('created_at', { ascending: false });

      // Get seller details for each transaction
      const sellerIds = [...new Set((transactions || []).map(t => t.seller_id))];
      const { data: sellers } = await supabase
        .from('sellers')
        .select('id, name, email, phone, paypal_email')
        .in('id', sellerIds);

      const sellersById = {};
      for (const s of sellers || []) {
        sellersById[s.id] = s;
      }

      const payouts = (transactions || []).map(t => ({
        ...t,
        seller: sellersById[t.seller_id] || null
      }));

      const totalPending = payouts.reduce((sum, p) => sum + (p.seller_payout || 0), 0);

      return res.status(200).json({
        success: true,
        payouts,
        totalPending
      });
    }

    // GET ALL TRANSACTIONS (for admin transactions page)
    if (action === 'transactions' && req.method === 'GET') {
      const statusFilter = req.query.status; // optional: pending_payout, paid
      const pipelineFilter = req.query.pipeline; // optional: pending_shipping, in_transit, delivered, available, paid

      let query = supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (pipelineFilter) {
        query = query.eq('payout_status', pipelineFilter);
      }

      const { data: transactions, error } = await query;

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      // Get seller details for each transaction (filter nulls for needs_attention txns)
      const sellerIds = [...new Set((transactions || []).map(t => t.seller_id).filter(Boolean))];
      const { data: sellers } = await supabase
        .from('sellers')
        .select('id, name, email, phone, paypal_email')
        .in('id', sellerIds.length ? sellerIds : ['none']);

      const sellersById = {};
      for (const s of sellers || []) {
        sellersById[s.id] = s;
      }

      const enriched = (transactions || []).map(t => ({
        ...t,
        seller: sellersById[t.seller_id] || null
      }));

      // Pipeline stats (counts + totals by payout_status)
      const pipeline = {};
      for (const status of ['needs_attention', 'pending_shipping', 'in_transit', 'delivered', 'available', 'paid', 'contested']) {
        const items = enriched.filter(t => t.payout_status === status);
        pipeline[status] = {
          count: items.length,
          total: items.reduce((sum, t) => sum + (t.seller_payout || 0), 0)
        };
      }

      // Shipping alerts: items overdue for shipping
      const now = new Date();
      const overdueShipping = enriched.filter(t =>
        t.payout_status === 'pending_shipping' &&
        t.ship_by && new Date(t.ship_by) < now
      );

      return res.status(200).json({
        success: true,
        transactions: enriched,
        stats: {
          totalGMV: enriched.reduce((sum, t) => sum + (t.sale_price || 0), 0),
          totalCommission: enriched.reduce((sum, t) => sum + ((t.sale_price || 0) - (t.seller_payout || 0)), 0),
          totalPending: enriched.filter(t => t.status !== 'paid').reduce((sum, t) => sum + (t.seller_payout || 0), 0),
          totalPaid: enriched.filter(t => t.status === 'paid').reduce((sum, t) => sum + (t.seller_payout || 0), 0),
          totalCount: enriched.length,
          pipeline,
          overdueShippingCount: overdueShipping.length
        }
      });
    }

    // SINGLE TRANSACTION (detail page) — includes seller payout defaults for auto-fill
    if (action === 'transaction' && req.method === 'GET') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      const { data: tx, error } = await supabase.from('transactions').select('*').eq('id', id).single();
      if (error || !tx) return res.status(404).json({ error: 'Transaction not found' });

      let seller = null;
      if (tx.seller_id) {
        const { data } = await supabase
          .from('sellers')
          .select('id, name, email, phone, paypal_email, payout_method, payment_provider, payment_handle')
          .eq('id', tx.seller_id)
          .single();
        seller = data;
      }

      return res.status(200).json({ success: true, transaction: { ...tx, seller } });
    }

    // MARK TRANSACTION AS PAID (with optional notes)
    if (action === 'mark-paid' && req.method === 'POST') {
      // payoutMethod/payoutHandle/payoutProvider are the new structured fields;
      // sellerNote is accepted for back-compat (old UI sent the method there).
      const { transactionId, payoutProvider, payoutMethod, payoutHandle, sellerNote, adminNote, skipNotification } = req.body;

      if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID required' });
      }

      const { data: tx, error: txErr } = await supabase
        .from('transactions').select('*').eq('id', transactionId).single();
      if (txErr || !tx) return res.status(404).json({ error: 'Transaction not found' });

      try {
        const { transaction, notificationSent } = await payViaProvider(tx, {
          provider: payoutProvider || 'zelle_manual',
          method:   payoutMethod || sellerNote,
          handle:   payoutHandle,
          adminNote,
          notify:   !skipNotification,
        });
        return res.status(200).json({ success: true, transaction, notificationSent });
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    // MANUAL RELEASE — force a delivered item to 'available' without waiting for the timer.
    if (action === 'release-payout' && req.method === 'POST') {
      const { transactionId } = req.body;
      if (!transactionId) return res.status(400).json({ error: 'Transaction ID required' });

      const { data: tx, error: txErr } = await supabase
        .from('transactions').select('*').eq('id', transactionId).single();
      if (txErr || !tx) return res.status(404).json({ error: 'Transaction not found' });

      try {
        const { released, transaction } = await releasePayout(tx);
        if (!released) {
          return res.status(400).json({ error: `Cannot release from status "${tx.payout_status}" (only delivered items can be released).` });
        }
        return res.status(200).json({ success: true, transaction });
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    // MARK CONCIERGE ITEM SHIPPED — Phirstory ships these, so there's no seller
    // label. Fulfill the Shopify order with the tracking number and advance status.
    if (action === 'mark-concierge-shipped' && req.method === 'POST') {
      const { transactionId, trackingNumber, carrier } = req.body;
      if (!transactionId || !trackingNumber) {
        return res.status(400).json({ error: 'transactionId and trackingNumber required' });
      }

      const { data: tx, error: txErr } = await supabase
        .from('transactions').select('*').eq('id', transactionId).single();
      if (txErr || !tx) return res.status(404).json({ error: 'Transaction not found' });

      let fulfillment = null;
      if (tx.order_id) {
        fulfillment = await fulfillOrder(tx.order_id, { tracking_number: trackingNumber, carrier: carrier || 'USPS' })
          .catch(e => ({ success: false, error: e.message }));
      }

      const { data: updated, error: upErr } = await supabase
        .from('transactions')
        .update({
          shipping_status: 'shipped',
          payout_status:   'in_transit',
          tracking_number: trackingNumber,
          carrier:         carrier || 'USPS',
        })
        .eq('id', transactionId)
        .select()
        .single();
      if (upErr) return res.status(400).json({ error: upErr.message });

      return res.status(200).json({ success: true, transaction: updated, fulfillment });
    }

    // EDIT RECEIPT — admin corrects commission / discount / payout on a transaction.
    // Recomputes payout (unless an explicit override is given), resyncs the Shopify
    // pricing metafields + appends a dated note to pricing.payout_notes, and logs it.
    if (action === 'update-receipt' && req.method === 'POST') {
      const { transactionId, commissionRate, discount, payoutOverride, adminEmail } = req.body;
      if (!transactionId) return res.status(400).json({ error: 'transactionId required' });

      const { data: tx, error: txErr } = await supabase
        .from('transactions').select('*').eq('id', transactionId).single();
      if (txErr || !tx) return res.status(404).json({ error: 'Transaction not found' });

      const platformFee = tx.platform_fee ?? PLATFORM_FEE;
      const rate = (commissionRate != null && commissionRate !== '') ? parseFloat(commissionRate) : tx.commission_rate;
      const newDiscount = (discount != null && discount !== '') ? parseFloat(discount) : (tx.discount_amount ?? 0);
      const hasOverride = payoutOverride != null && payoutOverride !== '';
      const newPayout = hasOverride
        ? parseFloat(payoutOverride)
        : calculateSellerPayout({ grossPrice: tx.sale_price || 0, commissionRate: rate, platformFee }).sellerPayout;

      const today = new Date().toISOString().slice(0, 10);
      const note = `${today} — sale $${Number(tx.sale_price || 0).toFixed(2)} − $${Number(platformFee).toFixed(2)} fee, commission ${tx.commission_rate ?? '—'}→${rate ?? '—'}%, payout $${tx.seller_payout ?? '—'}→$${newPayout ?? '—'}${hasOverride ? ' (manual override)' : ''}${adminEmail ? `, by ${adminEmail}` : ''}`;

      const { data: updated, error: upErr } = await supabase.from('transactions').update({
        commission_rate: rate,
        discount_amount: newDiscount,
        seller_payout:   newPayout,
        payout_status:   (tx.payout_status === 'needs_commission' && rate != null) ? 'pending_shipping' : tx.payout_status,
        admin_note:      tx.admin_note ? `${tx.admin_note}\n${note}` : note,
      }).eq('id', transactionId).select().single();
      if (upErr) return res.status(400).json({ error: upErr.message });

      // Resync Shopify pricing metafields + append the breakdown note (best-effort).
      let resync = { ok: false };
      if (tx.product_id) {
        try {
          const metafields = await fetchMetafields(tx.product_id);
          const ops = [];
          if (rate != null) ops.push(upsertMetafield(tx.product_id, metafields, 'pricing', 'commission_rate', String(rate)));
          if (newPayout != null) ops.push(upsertMetafield(tx.product_id, metafields, 'pricing', 'seller_payout', JSON.stringify({ amount: Number(newPayout).toFixed(2), currency_code: 'USD' })));
          const existingNotes = getMetafieldValue(metafields, 'pricing', 'payout_notes') || '';
          ops.push(upsertMetafield(tx.product_id, metafields, 'pricing', 'payout_notes', existingNotes ? `${existingNotes}\n${note}` : note, 'multi_line_text_field'));
          await Promise.all(ops);
          resync = { ok: true };
        } catch (e) {
          resync = { ok: false, error: e.message };
        }
      }

      // Audit log (best-effort; non-impersonation admin action).
      await supabase.from('audit_log').insert({
        actor_admin_email: adminEmail || null,
        target_seller_id:  tx.seller_id || null,
        action:            'receipt_edited',
        target_id:         String(tx.product_id || transactionId),
        payload:           { transactionId, oldRate: tx.commission_rate, newRate: rate, oldPayout: tx.seller_payout, newPayout, discount: newDiscount, override: hasOverride },
        request_path:      '/api/admin-listings?action=update-receipt',
      }).catch(() => {});

      return res.status(200).json({ success: true, transaction: updated, resync });
    }

    // UPDATE TRANSACTION COMMISSION & PAYOUT
    if (action === 'update-transaction' && req.method === 'POST') {
      const { transactionId, commissionRate, notify } = req.body;

      if (!transactionId || commissionRate == null) {
        return res.status(400).json({ error: 'transactionId and commissionRate required' });
      }
      const rate = parseFloat(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'commissionRate must be between 0 and 100' });
      }

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('*, seller:sellers(id, name, email, phone)')
        .eq('id', transactionId)
        .single();

      if (txErr || !tx) return res.status(404).json({ error: 'Transaction not found' });

      const platformFee = tx.platform_fee ?? PLATFORM_FEE;
      const { sellerPayout } = calculateSellerPayout({
        grossPrice: tx.sale_price || 0,
        commissionRate: rate,
        platformFee,
      });

      const { data: updated, error: updateErr } = await supabase
        .from('transactions')
        .update({
          commission_rate: rate,
          seller_payout:   sellerPayout,
          payout_status:   tx.payout_status === 'needs_commission' ? 'pending_shipping' : tx.payout_status
        })
        .eq('id', transactionId)
        .select()
        .single();

      if (updateErr) return res.status(400).json({ error: updateErr.message });

      let notificationSent = false;
      if (notify && tx.seller) {
        const seller = tx.seller;
        try {
          const { subject, html } = salePriceConfirmedEmail(
            seller.name, tx.product_title, tx.sale_price, platformFee, rate, sellerPayout
          );
          await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'sale_confirmed' });
          notificationSent = true;

          if (seller.phone && !seller.phone.startsWith('NOPHONE')) {
            const { sendWhatsApp } = await import('../lib/send-whatsapp.js');
            await sendWhatsApp({
              sellerId: seller.id,
              to: seller.phone,
              template: 'item_sold',
              params: [tx.product_title, tx.sale_price.toFixed(0)],
              context: 'sale_confirmed',
              textPreview: `Your item "${tx.product_title}" sold for $${tx.sale_price.toFixed(0)}. Your payout is $${sellerPayout.toFixed(0)}.`
            });
          }
        } catch (e) {
          console.error('Sale confirmed notification failed:', e.message);
        }
      }

      return res.status(200).json({ success: true, transaction: updated, sellerPayout, notificationSent });
    }

    // BULK MARK TRANSACTIONS AS PAID
    if (action === 'bulk-mark-paid' && req.method === 'POST') {
      const { transactionIds, sellerNote, adminNote, skipNotification } = req.body;

      if (!transactionIds?.length) {
        return res.status(400).json({ error: 'transactionIds array required' });
      }

      if (transactionIds.length > 50) {
        return res.status(400).json({ error: 'Max 50 transactions at a time' });
      }

      // Allow marking any non-paid status (not just 'available') when silent
      let query = supabase
        .from('transactions')
        .select('id, seller_id, product_title, seller_payout, payout_status')
        .in('id', transactionIds);

      if (!skipNotification) {
        query = query.eq('payout_status', 'available');
      } else {
        query = query.neq('payout_status', 'paid');
      }

      const { data: validTxs, error: fetchErr } = await query;

      if (fetchErr) {
        return res.status(400).json({ error: fetchErr.message });
      }

      if (!validTxs?.length) {
        return res.status(400).json({ error: 'No transactions in "available" status to mark as paid' });
      }

      // Record each payout through the shared service (writes structured fields:
      // payout_provider/method, paid_at). Notifications are sent in aggregate below.
      for (const t of validTxs) {
        await payViaProvider(t, { provider: 'zelle_manual', method: sellerNote, adminNote, notify: false })
          .catch(e => console.error(`Bulk mark-paid write failed for ${t.id}:`, e.message));
      }

      // Send notifications (unless silent)
      let notificationsSent = 0;
      if (!skipNotification) {
        const bySeller = {};
        for (const tx of validTxs) {
          if (!tx.seller_id) continue;
          if (!bySeller[tx.seller_id]) bySeller[tx.seller_id] = [];
          bySeller[tx.seller_id].push(tx);
        }

        for (const [sellerId, txs] of Object.entries(bySeller)) {
          const { data: seller } = await supabase
            .from('sellers')
            .select('email, name, phone')
            .eq('id', sellerId)
            .single();

          if (!seller?.email) continue;

          const totalPayout = txs.reduce((sum, t) => sum + (t.seller_payout || 0), 0);
          const paymentMethod = sellerNote ? ` via ${sellerNote}` : '';

          try {
            const itemDesc = txs.length === 1 ? txs[0].product_title : `${txs.length} items`;
            const metadata = { totalPayout, itemCount: txs.length, paymentMethod: sellerNote };

            const { subject, html } = payoutNotificationEmail(seller.name, itemDesc, totalPayout, sellerNote);
            await sendEmail({ sellerId, to: seller.email, subject, html, context: 'payout_sent', metadata });
            notificationsSent++;

            // WhatsApp — template: payout_sent ({{1}}=name, {{2}}=$amount, {{3}}=item desc, {{4}}=method)
            if (seller.phone && !seller.phone.startsWith('NOPHONE')) {
              await sendWhatsApp({
                sellerId,
                to: seller.phone,
                template: 'payout_sent',
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: seller.name || 'there' },
                      { type: 'text', text: `$${totalPayout.toFixed(2)}` },
                      { type: 'text', text: txs.length === 1 ? txs[0].product_title : `${txs.length} items` },
                      { type: 'text', text: sellerNote ? ` via ${sellerNote}` : ' to your account on file' }
                    ]
                  }
                ],
                context: 'payout_sent',
                metadata
              });
            }
          } catch (e) {
            console.error(`Bulk payout notification failed for ${seller.email}:`, e.message);
          }
        }
      }

      return res.status(200).json({
        success: true,
        updated: validTxs.length,
        skipped: transactionIds.length - validTxs.length,
        notificationsSent,
        silent: !!skipNotification
      });
    }

    // EXPORT PAYOUTS AS CSV
    if (action === 'export-payouts' && req.method === 'GET') {
      const payoutStatus = req.query.payout_status || 'available';

      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('payout_status', payoutStatus)
        .order('created_at', { ascending: false });

      // Get seller details
      const sellerIds = [...new Set((transactions || []).map(t => t.seller_id))];
      const { data: sellers } = await supabase
        .from('sellers')
        .select('id, name, email, paypal_email')
        .in('id', sellerIds.length ? sellerIds : ['none']);

      const sellersById = {};
      for (const s of sellers || []) {
        sellersById[s.id] = s;
      }

      // Generate CSV rows
      const rows = (transactions || []).map(t => {
        const seller = sellersById[t.seller_id] || {};
        return [
          seller.paypal_email || seller.email || '',
          (t.seller_payout || 0).toFixed(2),
          'USD',
          `Payout for ${t.product_title || 'item'}`,
          t.id,
          seller.name || '',
          t.product_title || '',
          t.order_name || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      });

      const csv = ['Email,Amount,Currency,Note,TransactionID,SellerName,ProductTitle,OrderName', ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payouts-${payoutStatus}-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.status(200).send(csv);
    }

    // SHIPPING ALERTS - items overdue for shipping
    if (action === 'shipping-alerts' && req.method === 'GET') {
      const now = new Date();

      // Items where ship_by has passed and still pending
      const { data: overdue } = await supabase
        .from('transactions')
        .select('*')
        .eq('payout_status', 'pending_shipping')
        .lt('ship_by', now.toISOString())
        .order('ship_by', { ascending: true });

      // Items with label but not shipped (label_created for 3+ days)
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const { data: labelNotShipped } = await supabase
        .from('transactions')
        .select('*')
        .eq('shipping_status', 'label_created')
        .lt('created_at', threeDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      // Get seller details
      const allTxs = [...(overdue || []), ...(labelNotShipped || [])];
      const sellerIds = [...new Set(allTxs.map(t => t.seller_id))];
      const { data: sellers } = await supabase
        .from('sellers')
        .select('id, name, email, phone')
        .in('id', sellerIds.length ? sellerIds : ['none']);

      const sellersById = {};
      for (const s of sellers || []) {
        sellersById[s.id] = s;
      }

      return res.status(200).json({
        success: true,
        overdue: (overdue || []).map(t => ({ ...t, seller: sellersById[t.seller_id] || null })),
        labelNotShipped: (labelNotShipped || []).map(t => ({ ...t, seller: sellersById[t.seller_id] || null }))
      });
    }

    // TEST: Create spoofed transaction (for testing only)
    if (action === 'test-transaction' && req.method === 'POST') {
      const { sellerEmail, productTitle, salePrice, sellerPayout } = req.body;

      if (!sellerEmail) {
        return res.status(400).json({ error: 'sellerEmail required' });
      }

      // Find seller
      const { data: seller } = await supabase
        .from('sellers')
        .select('id, name')
        .ilike('email', sellerEmail.toLowerCase())
        .maybeSingle();

      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Create test transaction
      const transaction = {
        seller_id: seller.id,
        order_id: `TEST-${Date.now()}`,
        order_name: `#TEST-${Math.floor(Math.random() * 9000) + 1000}`,
        product_id: `test-${Date.now()}`,
        product_title: productTitle || 'Test Product - Sana Safinaz Suit',
        sale_price: salePrice || 150,
        seller_payout: sellerPayout || 123,
        commission_rate: 18,
        status: 'pending_payout',
        customer_email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('transactions')
        .insert(transaction)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({
        success: true,
        message: `Created test transaction for ${seller.name || sellerEmail}`,
        transaction: data
      });
    }

    // TEST: Send test notification to seller
    if (action === 'test-notification' && req.method === 'POST') {
      const { sellerEmail, type } = req.body;

      if (!sellerEmail || !type) {
        return res.status(400).json({ error: 'sellerEmail and type required. Types: listing_approved, listing_rejected, item_sold, payout_sent' });
      }

      // Find seller
      const { data: seller } = await supabase
        .from('sellers')
        .select('*')
        .ilike('email', sellerEmail.toLowerCase())
        .maybeSingle();

      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      const results = { whatsapp: null, email: null };
      const testData = {
        productTitle: 'Test Product - Sana Safinaz Lawn Suit',
        salePrice: 150,
        sellerPayout: 123,
        productUrl: 'https://thephirstory.com/products/test'
      };
      const testMeta = { test: true, ...testData };

      // Send WhatsApp
      if (seller.phone && !seller.phone.startsWith('NOPHONE')) {
        let waPayload;

        if (type === 'listing_approved') {
          waPayload = {
            sellerId: seller.id,
            to: seller.phone,
            template: 'listing_approved',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: seller.name || 'there' },
                  { type: 'text', text: testData.productTitle },
                  { type: 'text', text: testData.sellerPayout.toFixed(2) }
                ]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: 'test' }]
              }
            ],
            context: type,
            metadata: testMeta,
            textPreview: `[TEST] Your listing "${testData.productTitle}" is now live!`
          };
        } else if (type === 'listing_rejected') {
          waPayload = {
            sellerId: seller.id,
            to: seller.phone,
            template: 'listing_rejected_v2',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: seller.name || 'there' },
                  { type: 'text', text: testData.productTitle },
                  { type: 'text', text: 'Item does not meet quality standards' }
                ]
              }
            ],
            context: type,
            metadata: testMeta,
            textPreview: `[TEST] Your listing "${testData.productTitle}" was not approved.`
          };
        } else if (type === 'item_sold') {
          waPayload = {
            sellerId: seller.id,
            to: seller.phone,
            template: 'item_sold',
            params: [testData.productTitle, testData.salePrice.toFixed(0)],
            context: type,
            metadata: testMeta,
            textPreview: `[TEST] Item sold: "${testData.productTitle}"`
          };
        } else if (type === 'payout_sent') {
          waPayload = {
            sellerId: seller.id,
            to: seller.phone,
            template: 'payout_sent',
            params: [seller.name || 'there', `$${testData.sellerPayout.toFixed(2)}`, testData.productTitle, ' via PayPal'],
            context: type,
            metadata: testMeta,
            textPreview: `[TEST] Payout sent for "${testData.productTitle}"`
          };
        }

        if (waPayload) {
          const waResult = await sendWhatsApp(waPayload);
          results.whatsapp = waResult.success ? 'sent' : waResult.error || 'failed';
        }
      }

      // Send Email
      if (seller.email) {
        let emailTemplate;
        if (type === 'listing_approved') {
          emailTemplate = listingApprovedEmail(seller.name, testData.productTitle, testData.productUrl, testData.sellerPayout);
        } else if (type === 'listing_rejected') {
          emailTemplate = listingRejectedEmail(seller.name, testData.productTitle, 'Item does not meet quality standards', 'This is a test rejection note');
        } else if (type === 'payout_sent') {
          emailTemplate = payoutNotificationEmail(seller.name, testData.productTitle, testData.sellerPayout, 'PayPal (test)');
        }

        if (emailTemplate) {
          const emailResult = await sendEmail({
            sellerId: seller.id,
            to: seller.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            context: type,
            metadata: testMeta
          });
          results.email = emailResult.success ? 'sent' : emailResult.error || 'failed';
        } else {
          results.email = 'no email template for this type';
        }
      }

      return res.status(200).json({
        success: true,
        message: `Test ${type} notification sent`,
        results,
        seller: { name: seller.name, email: seller.email, phone: seller.phone }
      });
    }

    // SEARCH SELLERS (for admin listing picker)
    if (action === 'sellers' && req.method === 'GET') {
      const search = req.query.search;
      if (!search || search.length < 2) {
        return res.status(200).json({ success: true, sellers: [] });
      }

      const { data: sellers } = await supabase
        .from('sellers')
        .select('id, name, email, phone')
        .or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(10);

      return res.status(200).json({ success: true, sellers: sellers || [] });
    }

    // CREATE LISTING (admin creates on behalf of seller)
    if (action === 'create' && req.method === 'POST') {
      const { sellerId, designer, item_type, size, color, material, condition, original_price, asking_price, description, chest, hip, notes, concierge } = req.body;

      if (!sellerId) {
        return res.status(400).json({ error: 'Seller ID required' });
      }
      if (!designer || !asking_price) {
        return res.status(400).json({ error: 'Designer and asking price required' });
      }

      // Look up seller
      const { data: seller, error: sellerErr } = await supabase
        .from('sellers')
        .select('id, name, email, phone')
        .eq('id', sellerId)
        .single();

      if (sellerErr || !seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      console.log('Admin create listing:', { designer, item_type, size, asking_price, sellerId, sellerEmail: seller.email });

      const product = await createDraft({
        designer,
        itemType: item_type,
        size: size || 'One Size',
        condition: condition || 'Good',
        askingPrice: parseFloat(asking_price) || 0,
        color,
        material,
        description,
        sellerEmail: seller.email,
        sellerId: seller.id,
        sellerPhone: seller.phone,
        chest,
        hip,
        notes,
        originalPrice: parseFloat(original_price) || 0,
        source: 'admin',
        concierge: !!concierge
      });

      // Link to seller in Supabase
      await supabase
        .from('listings')
        .insert({
          seller_id: seller.id,
          shopify_product_id: product.id.toString(),
          status: 'pending',
          created_at: new Date().toISOString()
        });

      // Add product to seller's shopify_product_ids so it appears in their dashboard
      await addProductToSeller(seller.id, product.id);

      // Bust the seller's listings cache so the new product shows up immediately
      await cacheBust(`listings:seller:${seller.email.toLowerCase()}`);

      const shopifyAdminUrl = `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`;

      // Send admin notification
      try {
        await sendEmail({
          to: 'thephirstory@gmail.com',
          subject: `New Listing (Admin): ${designer} - ${item_type || 'Item'}`,
          html: `<h3>Admin-created listing</h3>
            <p><strong>Designer:</strong> ${designer}</p>
            <p><strong>Item:</strong> ${item_type || 'Unknown'}</p>
            <p><strong>Asking Price:</strong> $${asking_price}</p>
            <p><strong>Seller:</strong> ${seller.name || seller.email}</p>
            <p><a href="${shopifyAdminUrl}">View in Shopify</a></p>`,
          context: 'admin_created_listing'
        });
      } catch (emailErr) {
        console.error('Admin listing email error:', emailErr);
      }

      return res.status(200).json({
        success: true,
        productId: product.id,
        shopifyAdminUrl
      });
    }

    // SIMULATE SALE — test the full seller shipping flow with a real product
    if (action === 'simulate-sale' && req.method === 'POST') {
      const { productId, sellerId, salePrice } = req.body;

      if (!productId || !sellerId) {
        return res.status(400).json({ error: 'productId and sellerId required' });
      }

      // Fetch seller
      const { data: seller } = await supabase
        .from('sellers')
        .select('id, name, email, phone')
        .eq('id', sellerId)
        .single();

      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Fetch product from Shopify for title
      let productTitle = 'Simulated Product';
      try {
        const product = await getProduct(productId);
        if (product) productTitle = product.title;
      } catch { /* use default */ }

      const price = parseFloat(salePrice) || 100;
      const commissionRate = 18;
      const sellerPayout = Math.round(calculateSellerPayout({ grossPrice: price, commissionRate }).sellerPayout * 100) / 100;

      const shipBy = new Date();
      shipBy.setDate(shipBy.getDate() + 7);

      const testBuyerAddress = {
        name: 'Test Buyer',
        street1: '123 Test Street',
        street2: '',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US',
        phone: '+12125551234'
      };

      const transaction = {
        seller_id: seller.id,
        order_id: `SIM-${Date.now()}`,
        order_name: `#SIM-${Math.floor(Math.random() * 9000) + 1000}`,
        product_id: productId.toString(),
        product_title: productTitle,
        sale_price: price,
        seller_payout: sellerPayout,
        commission_rate: commissionRate,
        status: 'pending_payout',
        payout_status: 'pending_shipping',
        shipping_status: 'pending_label',
        ship_by: shipBy.toISOString(),
        buyer_address: testBuyerAddress,
        customer_email: 'test-buyer@example.com',
        created_at: new Date().toISOString()
      };

      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert(transaction)
        .select()
        .single();

      if (txError) {
        return res.status(400).json({ error: txError.message });
      }

      // Send sale notifications (email + WhatsApp) — same as real sale
      try {
        const { notifySeller } = await import('../lib/shopify-webhook.js');
        await notifySeller(seller, {
          productTitle,
          salePrice: price,
          sellerPayout,
          shipBy: shipBy.toISOString()
        });
      } catch (notifyErr) {
        console.error('Simulate sale notification error:', notifyErr);
      }

      return res.status(200).json({
        success: true,
        message: `Simulated sale for "${productTitle}" — seller notified`,
        transactionId: txData.id,
        transaction: txData
      });
    }

    // BACKFILL ORDERS — process paid Shopify orders from the last N days that are missing transactions
    if (action === 'backfill-orders' && req.method === 'POST') {
      const days = parseInt(req.body?.days || 7, 10);
      const dryRun = req.body?.dryRun === true;

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Fetch paid orders from Shopify since the cutoff date
      const { url, token } = { url: process.env.VITE_SHOPIFY_STORE_URL, token: process.env.VITE_SHOPIFY_ACCESS_TOKEN };
      const ordersRes = await fetch(
        `https://${url}/admin/api/2024-10/orders.json?status=any&financial_status=paid&created_at_min=${since}&limit=250`,
        { headers: { 'X-Shopify-Access-Token': token } }
      );
      const { orders } = await ordersRes.json();

      console.log(`📦 Backfill: found ${orders?.length || 0} paid orders since ${since}`);

      const results = { processed: 0, skipped: 0, errors: [], items: [] };

      for (const order of orders || []) {
        for (const item of order.line_items || []) {
          const productId = item.product_id;
          if (!productId) continue;

          // Skip if transaction already exists
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id')
            .eq('order_id', order.id.toString())
            .eq('product_id', productId.toString())
            .maybeSingle();

          if (existingTx) {
            results.skipped++;
            continue;
          }

          if (dryRun) {
            results.items.push({ order: order.name, product: item.title, status: 'would_create' });
            results.processed++;
            continue;
          }

          try {
            // Fetch seller from metafields
            let sellerEmail = null, sellerId = null, sellerPayout = null, commissionRate = null;
            try {
              const metafields = await fetchMetafields(productId);
              sellerEmail    = getSellerEmail(metafields);
              sellerId       = getSellerId(metafields);
              sellerPayout   = parseFloat(getMetafieldValue(metafields, 'pricing', 'seller_payout')) || null;
              const rateVal  = getMetafieldValue(metafields, 'pricing', 'commission_rate');
              commissionRate = rateVal ? parseFloat(rateVal) : null;
            } catch {}

            let seller = null;
            if (sellerId) {
              const { data } = await supabase.from('sellers').select('*').eq('id', sellerId).single();
              seller = data;
            }
            if (!seller && sellerEmail) {
              const { data } = await supabase.from('sellers').select('*').eq('email', sellerEmail.toLowerCase()).single();
              seller = data;
            }

            const discountTotal = (item.discount_allocations || [])
              .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
            const salePrice = parseFloat(item.price) - discountTotal;
            const { commissionKnown, sellerPayout: computedPayout } = calculateSellerPayout({
              grossPrice: parseFloat(item.price),
              discount: discountTotal,
              commissionRate,
            });
            if (!sellerPayout) sellerPayout = computedPayout; // null when rate unknown

            const buyerAddress = order.shipping_address ? {
              name: order.shipping_address.name, street1: order.shipping_address.address1,
              street2: order.shipping_address.address2 || '', city: order.shipping_address.city,
              state: order.shipping_address.province_code, zip: order.shipping_address.zip,
              country: order.shipping_address.country_code || 'US', phone: order.shipping_address.phone || ''
            } : null;

            const shipBy = new Date(new Date(order.created_at).getTime() + 7 * 24 * 60 * 60 * 1000);

            const { error: txError } = await supabase.from('transactions').insert({
              seller_id:       seller?.id || null,
              order_id:        order.id.toString(),
              order_name:      order.name,
              product_id:      productId.toString(),
              product_title:   item.title,
              product_image:   item.image?.src || null,
              sale_price:      salePrice,
              discount_amount: discountTotal,
              platform_fee:    PLATFORM_FEE,
              seller_payout:   sellerPayout,
              commission_rate: commissionRate,
              status:          'pending_payout',
              payout_status:   !seller ? 'needs_attention' : (!commissionKnown ? 'needs_commission' : 'pending_shipping'),
              shipping_status: seller ? 'pending_label'    : 'needs_attention',
              customer_email:  order.email,
              buyer_address:   buyerAddress,
              ship_by:         shipBy.toISOString(),
              created_at:      order.created_at,
              admin_note:      `Backfilled from order ${order.name}${!seller ? ` — SELLER NOT FOUND (email: ${sellerEmail}, id: ${sellerId})` : ''}`
            });

            if (txError) throw new Error(txError.message);

            results.processed++;
            results.items.push({ order: order.name, product: item.title, seller: seller?.email || 'MISSING', payout: sellerPayout, status: 'created' });
          } catch (err) {
            results.errors.push({ order: order.name, product: item.title, error: err.message });
          }
        }
      }

      console.log(`✅ Backfill done: ${results.processed} created, ${results.skipped} skipped, ${results.errors.length} errors`);
      return res.status(200).json({ success: true, dryRun, days, ...results });
    }

    if (action === 'scrape-url' && req.method === 'POST') {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
      const data = await scrapePage(url);
      return res.status(200).json({ success: true, url, data });
    }

    // GET ALL LISTINGS — active Shopify products enriched with seller metafields
    if (action === 'all-listings' && req.method === 'GET') {
      const { url: storeUrl, token } = {
        url: process.env.VITE_SHOPIFY_STORE_URL,
        token: process.env.VITE_SHOPIFY_ACCESS_TOKEN
      };
      const missingOnly = req.query.missing === 'true';

      // Cache the full enriched list for 6 hours — cache is busted on approve/reject/revision
      const enriched = await withCache(CACHE_ALL, 21600, async () => {
        const res1 = await fetch(
          `https://${storeUrl}/admin/api/2024-10/products.json?status=active&limit=250&fields=id,title,vendor,variants,images,tags,handle`,
          { headers: { 'X-Shopify-Access-Token': token } }
        );
        const { products } = await res1.json();

        const result = [];
        const BATCH = 10;
        for (let i = 0; i < (products || []).length; i += BATCH) {
          const batch = products.slice(i, i + BATCH);
          const withMeta = await Promise.all(batch.map(async (p) => {
            const metafields = await fetchMetafields(p.id);
            const sellerEmail = getSellerEmail(metafields);
            const sellerId = getSellerId(metafields);
            const { commissionRate, sellerAskingPrice, sellerPayout } = extractPricing(metafields, p.variants?.[0]?.price);
            const seller = await resolveSellerFromProduct(sellerEmail, sellerId, p.id, 'id, name, email, phone');
            const hasSeller = !!(seller || sellerEmail || sellerId);
            return {
              id: p.id,
              title: p.title,
              designer: p.vendor || '',
              handle: p.handle,
              tags: p.tags,
              price: parseFloat(p.variants?.[0]?.price) || 0,
              image: p.images?.[0]?.src || null,
              isSold: (p.variants?.[0]?.inventory_quantity ?? 1) === 0,
              sellerEmail: seller?.email || sellerEmail || null,
              sellerName: seller?.name || null,
              sellerId: seller?.id || sellerId || null,
              sellerPhone: seller?.phone || null,
              commissionRate,
              sellerAskingPrice,
              sellerPayout,
              hasSeller,
              shopifyAdminUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${p.id}`
            };
          }));
          result.push(...withMeta);
        }
        return result;
      });

      const filtered = missingOnly ? enriched.filter(p => !p.hasSeller) : enriched;
      return res.status(200).json({
        success: true,
        listings: filtered,
        total: enriched.length,
        missing: enriched.filter(p => !p.hasSeller).length
      });
    }

    // FIX LISTING SELLER — assign seller + update pricing metafields
    if (action === 'fix-listing-seller' && req.method === 'POST') {
      const { productId, sellerId: targetSellerId, commissionRate: newRate } = req.body;
      if (!productId || !targetSellerId) {
        return res.status(400).json({ error: 'productId and sellerId required' });
      }

      // Look up seller
      const { data: seller } = await supabase
        .from('sellers')
        .select('id, name, email, phone')
        .eq('id', targetSellerId)
        .single();

      if (!seller) return res.status(404).json({ error: 'Seller not found' });

      const rate = parseFloat(newRate) || 18;
      const metafields = await fetchMetafields(productId);

      // Fetch product to get current price
      const product = await getProduct(productId);
      const listingPrice = parseFloat(product.variants?.[0]?.price) || 0;
      const askingPrice = Math.max(0, listingPrice - PLATFORM_FEE);
      const { sellerPayout } = calculateSellerPayout({ grossPrice: listingPrice, commissionRate: rate });

      // Upsert all seller + pricing metafields
      await Promise.all([
        upsertMetafield(productId, metafields, 'seller', 'id', seller.id, 'single_line_text_field'),
        upsertMetafield(productId, metafields, 'seller', 'email', seller.email, 'single_line_text_field'),
        upsertMetafield(productId, metafields, 'pricing', 'commission_rate', rate.toFixed(2)),
        upsertMetafield(productId, metafields, 'pricing', 'seller_asking_price', askingPrice.toFixed(2)),
        upsertMetafield(productId, metafields, 'pricing', 'seller_payout', sellerPayout.toFixed(2)),
      ]);

      // Link listing to seller in Supabase listings table
      await supabase.from('listings').upsert({
        seller_id: seller.id,
        shopify_product_id: productId.toString(),
        status: 'active',
        updated_at: new Date().toISOString()
      }, { onConflict: 'shopify_product_id' });

      // Add product to seller's shopify_product_ids array so the seller dashboard finds it,
      // then bust their cache so it shows up immediately.
      const { data: freshSeller } = await supabase
        .from('sellers')
        .select('shopify_product_ids')
        .eq('id', seller.id)
        .single();
      const updatedIds = [...new Set([...(freshSeller?.shopify_product_ids || []), productId.toString()])];
      await supabase.from('sellers').update({ shopify_product_ids: updatedIds }).eq('id', seller.id);
      await cacheBust(`listings:seller:${seller.email.toLowerCase()}`);

      // Surgically update the Redis cache for this one listing instead of busting the whole
      // cache. Cache bust + re-populate creates a race condition where the Layout.jsx background
      // prefetch can re-write stale data back to localStorage before the fresh fetch arrives.
      const numericId = parseInt(productId);
      const { cacheGet: cGet, cacheSet: cSet } = await import('../lib/cache.js');
      const cached = await cGet(CACHE_ALL);
      if (cached && Array.isArray(cached)) {
        const updatedCache = cached.map(item =>
          item.id === numericId
            ? {
                ...item,
                sellerName: seller.name,
                sellerEmail: seller.email,
                sellerId: seller.id,
                sellerPhone: seller.phone || item.sellerPhone,
                hasSeller: true,
                commissionRate: rate,
                sellerAskingPrice: askingPrice,
                sellerPayout
              }
            : item
        );
        await cSet(CACHE_ALL, updatedCache, 21600);
      } else {
        // No cache yet — just bust so the next call builds fresh
        await cacheBust(CACHE_ALL);
      }

      // Build the enriched listing to return to the frontend so it can update local
      // state + localStorage without needing another round-trip.
      const updatedListing = {
        id: numericId,
        title: product.title,
        designer: product.vendor || '',
        handle: product.handle,
        tags: product.tags,
        price: listingPrice,
        image: product.images?.[0]?.src || null,
        isSold: (product.variants?.[0]?.inventory_quantity ?? 1) === 0,
        sellerEmail: seller.email,
        sellerName: seller.name,
        sellerId: seller.id,
        sellerPhone: seller.phone || null,
        commissionRate: rate,
        sellerAskingPrice: askingPrice,
        sellerPayout,
        hasSeller: true,
        shopifyAdminUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${productId}`
      };

      return res.status(200).json({
        success: true,
        seller: { id: seller.id, name: seller.name, email: seller.email },
        commissionRate: rate,
        sellerPayout: sellerPayout.toFixed(2),
        listing: updatedListing   // full enriched listing for frontend cache update
      });
    }

    // ACTIVITY FEED — recent seller events for admin dashboard
    if (action === 'activity' && req.method === 'GET') {
      const limit = parseInt(req.query.limit) || 40;

      // Fetch recent messages with seller-side contexts
      const { data: messages } = await supabase
        .from('messages')
        .select('id, seller_id, type, context, content, subject, metadata, created_at')
        .in('context', ['price_updated', 'seller_revised', 'listing_approved', 'listing_rejected', 'revision_requested', 'item_sold', 'new_offer', 'offer_accepted', 'payout_sent'])
        .order('created_at', { ascending: false })
        .limit(limit);

      // Fetch recent transactions (sales) for cross-reference
      const { data: recentSales } = await supabase
        .from('transactions')
        .select('id, seller_id, product_title, sale_price, seller_payout, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      // Enrich messages with seller names
      const sellerIds = [...new Set((messages || []).map(m => m.seller_id).filter(Boolean))];
      let sellerMap = {};
      if (sellerIds.length) {
        const { data: sellers } = await supabase
          .from('sellers')
          .select('id, name, email')
          .in('id', sellerIds);
        for (const s of sellers || []) sellerMap[s.id] = s;
      }

      // Deduplicate: one entry per (seller, context, productId, minute) — WA + email both log the same event
      const seen = new Set();
      const activity = (messages || []).reduce((acc, m) => {
        const productId = m.metadata?.productId || m.metadata?.shopifyProductId || '';
        const key = `${m.seller_id}|${m.context}|${productId}|${(m.created_at || '').slice(0, 16)}`;
        if (seen.has(key)) return acc;
        seen.add(key);
        acc.push({
          id: m.id,
          context: m.context,
          seller: sellerMap[m.seller_id] || null,
          content: m.content,
          subject: m.subject,
          metadata: m.metadata,
          createdAt: m.created_at
        });
        return acc;
      }, []);

      return res.status(200).json({ success: true, activity, recentSales: recentSales || [] });
    }

    // ─── AUDIT LISTINGS ───────────────────────────────────────────────────────
    if (action === 'audit-listings' && req.method === 'GET') {
      const SHOP = process.env.VITE_SHOPIFY_STORE_URL;
      const TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

      const SIZE_MAP = {
        'xxs': 'XXS', 'extra extra small': 'XXS',
        'xs': 'XS', 'extra small': 'XS', 'xsmall': 'XS',
        's': 'S', 'small': 'S', 'sm': 'S',
        'm': 'M', 'medium': 'M', 'med': 'M',
        'l': 'L', 'large': 'L', 'lg': 'L',
        'xl': 'XL', 'extra large': 'XL', 'xlarge': 'XL',
        'xxl': 'XXL', 'extra extra large': 'XXL', '2xl': 'XXL',
        'xxxl': 'XXXL', '3xl': 'XXXL',
        'one size': 'One Size', 'os': 'One Size', 'onesize': 'One Size', 'free size': 'One Size',
        'unstitched': 'Unstitched',
        'measurements': 'Measurements',
        '0-6 months': '0-6M', '0-6m': '0-6M',
        '6-12 months': '6-12M', '6-12m': '6-12M',
        '1-2 years': '1-2Y', '1-2 yrs': '1-2Y', '1-2y': '1-2Y',
        '2-3 years': '2-3Y', '2-3 yrs': '2-3Y', '2-3y': '2-3Y',
        '3-4 years': '3-4Y', '3-4 yrs': '3-4Y', '3-4y': '3-4Y',
        '4-5 years': '4-5Y', '4-5 yrs': '4-5Y', '4-5y': '4-5Y', '4y': '4Y',
        '5-6 years': '5-6Y', '5-6 yrs': '5-6Y', '5-6y': '5-6Y', '6y': '6Y',
        '6-7 years': '6-7Y', '6-7y': '6-7Y',
        '7-8 years': '7-8Y', '7-8 yrs': '7-8Y', '7-8y': '7-8Y',
        '8-9 years': '8-9Y', '8-9y': '8-9Y',
        '9-10 years': '9-10Y', '9-10y': '9-10Y',
      };
      const CANONICAL_SIZES = new Set(Object.values(SIZE_MAP));

      function canonicalSize(raw) {
        if (!raw) return null;
        const lower = raw.toLowerCase().trim();
        if (SIZE_MAP[lower]) return SIZE_MAP[lower];
        if (CANONICAL_SIZES.has(raw)) return raw;
        return null;
      }

      async function fetchByStatus(status) {
        const products = [];
        let url = `https://${SHOP}/admin/api/2024-10/products.json?limit=250&status=${status}&fields=id,title,handle,vendor,tags,variants,images`;
        while (url) {
          const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': TOKEN } });
          if (!r.ok) throw new Error(`Shopify ${status}: ${r.status}`);
          const d = await r.json();
          (d.products || []).forEach(p => { p._status = status; });
          products.push(...(d.products || []));
          const link = r.headers.get('link') || '';
          const next = link.match(/<([^>]+)>;\s*rel="next"/);
          url = next ? next[1] : null;
        }
        return products;
      }

      const [active, draft] = await Promise.all([fetchByStatus('active'), fetchByStatus('draft')]);
      const products = [...active, ...draft];

      const issues = {
        price_issues: [],
        default_title: [],
        size_needs_fix: [],
        size_unknown: [],
        needs_tag_cleanup: [],  // has CH-* tags that need stripping
        missing_brand: [],      // no CH-brand and no vendor
      };
      let clean = 0;

      for (const p of products) {
        const tags = p.tags ? p.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const chTags = tags.filter(t => t.startsWith('CH-'));
        const nonChTags = tags.filter(t => !t.startsWith('CH-'));
        const productIssues = [];

        // Extract CH-tag values
        const chBrand = chTags.find(t => t.startsWith('CH-brand-'))?.slice('CH-brand-'.length) || null;
        const chSize = chTags.find(t => t.startsWith('CH-size-'))?.slice('CH-size-'.length) || null;
        const chCondition = chTags.find(t => t.startsWith('CH-condition-'))?.slice('CH-condition-'.length) || null;
        const chColor = chTags.find(t => t.startsWith('CH-color-'))?.slice('CH-color-'.length) || null;
        const chCategory = chTags.find(t => t.startsWith('CH-category-'))?.slice('CH-category-'.length) || null;
        const chGender = chTags.find(t => t.startsWith('CH-gender-'))?.slice('CH-gender-'.length) || null;

        const effectiveBrand = chBrand || p.vendor || null;

        for (const variant of p.variants || []) {
          const rawSize = variant.option1;
          const price = parseFloat(variant.price || '0');

          if (rawSize === 'Default Title') {
            issues.default_title.push({
              id: p.id, title: p.title, handle: p.handle,
              image: p.images?.[0]?.src || null,
              _status: p._status
            });
            productIssues.push('default_title');
            continue;
          }

          if (!variant.price || variant.price === '') {
            issues.price_issues.push({ id: p.id, title: p.title, handle: p.handle, type: 'no_price', image: p.images?.[0]?.src || null });
            productIssues.push('price');
          } else if (price === 0) {
            issues.price_issues.push({ id: p.id, title: p.title, handle: p.handle, type: 'zero_price', price: variant.price, image: p.images?.[0]?.src || null });
            productIssues.push('price');
          }

          const canonical = canonicalSize(rawSize);
          if (canonical === null) {
            issues.size_unknown.push({
              id: p.id, title: p.title, handle: p.handle,
              rawSize, variantId: variant.id,
              image: p.images?.[0]?.src || null
            });
            productIssues.push('size_unknown');
          } else if (canonical !== rawSize) {
            issues.size_needs_fix.push({
              id: p.id, title: p.title, handle: p.handle,
              variantId: variant.id, rawSize, canonical,
              image: p.images?.[0]?.src || null
            });
            productIssues.push('size_needs_fix');
          }
        }

        // Tag cleanup needed if any CH-* tags exist
        if (chTags.length > 0) {
          // ── Canonical maps ────────────────────────────────────────────────
          // Gender: always lowercase
          const GENDER_CANON = { women: 'women', woman: 'women', ladies: 'women', girls: 'women', men: 'men', man: 'men', boys: 'men', kids: 'kids', children: 'kids', baby: 'kids', unisex: 'unisex' };

          // Conditions: exact canonical strings matching sms-webhook.js
          const CONDITION_CANON = {
            'new with tags': 'New with tags', 'nwt': 'New with tags', 'brand new': 'New with tags',
            'like new': 'Like new', 'like-new': 'Like new',
            'excellent': 'Excellent', 'very good': 'Excellent', 'very-good': 'Excellent',
            'good': 'Good',
            'fair': 'Fair', 'used': 'Fair',
          };

          function canonCondition(raw) {
            if (!raw) return null;
            return CONDITION_CANON[raw.toLowerCase().trim()] ?? raw;
          }

          // Start from nonChTags: normalize gender + conditions, remove legacy preloved
          const normalised = nonChTags
            .filter(t => t.toLowerCase() !== 'preloved')
            .map(t => {
              const lo = t.toLowerCase();
              if (GENDER_CANON[lo]) return GENDER_CANON[lo];
              if (CONDITION_CANON[lo]) return CONDITION_CANON[lo];
              return t;
            });

          // Case-insensitive dedup helper
          const lowerSeen = new Set(normalised.map(t => t.toLowerCase()));
          function addTag(t) {
            if (!t) return;
            const lo = t.toLowerCase();
            if (!lowerSeen.has(lo)) { normalised.push(t); lowerSeen.add(lo); }
          }

          // Add CH-derived tags (canonical form)
          const canonGender = chGender ? (GENDER_CANON[chGender.toLowerCase()] ?? chGender.toLowerCase()) : null;
          addTag(canonGender);
          if (chSize && CANONICAL_SIZES.has(chSize)) addTag(chSize);
          if (chCategory) addTag(chCategory);
          addTag(canonCondition(chCondition));
          if (effectiveBrand) addTag(effectiveBrand);

          const cleanTags = normalised;

          issues.needs_tag_cleanup.push({
            id: p.id, title: p.title, handle: p.handle,
            image: p.images?.[0]?.src || null,
            currentTags: tags,
            chTags, nonChTags,
            extracted: { brand: chBrand, size: chSize, condition: chCondition, color: chColor, category: chCategory, gender: chGender },
            proposedTags: cleanTags,
            proposedVendor: effectiveBrand,
            currentVendor: p.vendor,
            _status: p._status
          });
          productIssues.push('tags');
        }

        if (!effectiveBrand) {
          issues.missing_brand.push({ id: p.id, title: p.title, handle: p.handle, image: p.images?.[0]?.src || null });
          productIssues.push('missing_brand');
        }

        if (productIssues.length === 0) clean++;
      }

      return res.status(200).json({
        success: true,
        summary: { total: products.length, clean, has_issues: products.length - clean },
        issues
      });
    }

    // ─── FIX LISTING ──────────────────────────────────────────────────────────
    if (action === 'fix-listing' && req.method === 'POST') {
      const { productId, variantId, fixType, newSize, newTags, newVendor } = req.body;
      if (!productId) return res.status(400).json({ error: 'productId required' });

      const SHOP = process.env.VITE_SHOPIFY_STORE_URL;
      const TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;
      const changes = [];

      // Fix variant size
      if (fixType === 'size' || fixType === 'full') {
        if (variantId && newSize) {
          const vRes = await fetch(`https://${SHOP}/admin/api/2024-10/variants/${variantId}.json`, {
            method: 'PUT',
            headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant: { id: variantId, option1: newSize } })
          });
          if (!vRes.ok) {
            const err = await vRes.text();
            return res.status(500).json({ error: `Variant update failed: ${err}` });
          }
          changes.push(`size: → ${newSize}`);
        }
      }

      // Fix tags + vendor
      if (fixType === 'tags' || fixType === 'full') {
        const updates = {};
        if (newTags) updates.tags = Array.isArray(newTags) ? newTags.join(', ') : newTags;
        if (newVendor) updates.vendor = newVendor;

        if (Object.keys(updates).length) {
          const pRes = await fetch(`https://${SHOP}/admin/api/2024-10/products/${productId}.json`, {
            method: 'PUT',
            headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ product: { id: productId, ...updates } })
          });
          if (!pRes.ok) {
            const err = await pRes.text();
            return res.status(500).json({ error: `Product update failed: ${err}` });
          }
          if (updates.tags) changes.push(`tags updated`);
          if (updates.vendor) changes.push(`vendor: → ${updates.vendor}`);
        }
      }

      await cacheBust(CACHE_ALL);
      return res.status(200).json({ success: true, productId, changes });
    }

    // ── SYNC-SELLER-LISTINGS ─ additively rebuild shopify_product_ids ──
    if (action === 'sync-seller-listings' && req.method === 'POST') {
      const { sellerId, sellerEmail } = req.body;
      if (!sellerId) return res.status(400).json({ error: 'sellerId required' });

      const sources = { existing: 0, transactions: 0, listings_table: 0 };

      // ── Always start from the existing array — sync can only ADD, never shrink ──
      const { data: sellerRow } = await supabase
        .from('sellers')
        .select('shopify_product_ids')
        .eq('id', sellerId)
        .single();

      const existingIds = (sellerRow?.shopify_product_ids || []).map(id => id.toString());
      sources.existing = existingIds.length;

      // ── Supabase transactions (sold items) ──
      const { data: txRows } = await supabase
        .from('transactions')
        .select('product_id')
        .eq('seller_id', sellerId)
        .not('product_id', 'is', null);

      const idsFromTx = (txRows || []).map(r => r.product_id.toString());
      sources.transactions = idsFromTx.length;

      // ── Supabase listings table (active/pending items) ──
      const { data: listingRows } = await supabase
        .from('listings')
        .select('shopify_product_id')
        .eq('seller_id', sellerId)
        .not('shopify_product_id', 'is', null);

      const idsFromListings = (listingRows || []).map(r => r.shopify_product_id.toString());
      sources.listings_table = idsFromListings.length;

      // ── Merge: union of all sources, never remove existing ──
      const merged = [...new Set([...existingIds, ...idsFromTx, ...idsFromListings])];

      if (merged.length === existingIds.length && idsFromTx.length === 0 && idsFromListings.length === 0) {
        return res.status(200).json({ success: true, productIds: merged, sources, message: 'Nothing new found — array unchanged' });
      }

      await supabase
        .from('sellers')
        .update({ shopify_product_ids: merged })
        .eq('id', sellerId);

      if (sellerEmail) {
        await cacheBust(`listings:seller:${sellerEmail.toLowerCase()}`);
      }
      await cacheBust(CACHE_ALL);

      return res.status(200).json({ success: true, productIds: merged, sources });
    }

    return res.status(400).json({ error: 'Invalid action. Use: pending, approve, reject, payouts, transactions, mark-paid, bulk-mark-paid, export-payouts, shipping-alerts, sellers, create, simulate-sale, test-transaction, test-notification, backfill-orders, scrape-url, activity, audit-listings, fix-listing, sync-seller-listings' });

  } catch (error) {
    console.error('Admin listings error:', error);
    return res.status(500).json({ error: error.message });
  }
}

