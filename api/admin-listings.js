// api/admin-listings.js
// Consolidated admin listing actions: get-pending, approve, reject

import { approveDraft, getProduct, deleteProduct, getPendingDrafts, getProductCounts, updateProduct, createDraft } from '../lib/shopify.js';
import { listingApprovedEmail, payoutNotificationEmail, listingRejectedEmail, listingRevisionEmail } from '../lib/email.js';
import { sendEmail } from '../lib/send-email.js';
import { sendWhatsApp } from '../lib/send-whatsapp.js';
import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';
import { fetchMetafields, getSellerEmail, getSellerId, getMetafieldValue, extractPricing, upsertMetafield } from '../lib/shopify-metafields.js';
import { resolveSellerFromProduct } from '../lib/seller-lookup.js';
import { scrapePage } from '../lib/scraper.js';

const STORE_URL = process.env.VITE_SHOPIFY_STORE_URL?.replace('.myshopify.com', '');

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const { action } = req.query;

  try {
    // GET PENDING LISTINGS
    if (action === 'pending' && req.method === 'GET') {
      const products = await getPendingDrafts();
      const counts = await getProductCounts();

      // Get sold count from transactions table
      const { count: soldCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true });

      // Fetch metafields for all products to get seller info
      const listingsWithSeller = await Promise.all(products.map(async (product) => {
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
      }));

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

        // Send WhatsApp (utility template with View Listing button)
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

      return res.status(200).json({
        success: true,
        productId: product.id,
        productUrl,
        notificationSent: !skipNotification && !!sellerEmail
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

      return res.status(200).json({
        success: true,
        message: 'Listing rejected and notifications sent',
        notificationSent: !skipNotification && !!seller
      });
    }

    // REQUEST REVISION — keep draft alive, tag as needs-revision, notify seller
    if (action === 'request-revision' && req.method === 'POST') {
      const { shopifyProductId, note, skipNotification } = req.body;

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

      // Store revision note as metafield so seller portal can display it
      await upsertMetafield(shopifyProductId, metafields, 'custom', 'revision_note', note);

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

        // WhatsApp
        if (seller.phone) {
          await sendWhatsApp({
            sellerId: seller.id,
            to: seller.phone,
            textBody: `Hi ${seller.name || 'there'}! We reviewed your listing "${product.title}" and need a small update before we can approve it:\n\n"${note}"\n\nPlease update your listing here: ${portalUrl}\n\nThank you! 🙏`,
            context: 'revision_requested',
            metadata,
            textPreview: `Revision requested for "${product.title}": ${note}`
          });
        }
        notificationSent = true;
      }

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

    // MARK TRANSACTION AS PAID (with optional notes)
    if (action === 'mark-paid' && req.method === 'POST') {
      const { transactionId, sellerNote, adminNote, skipNotification } = req.body;

      if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID required' });
      }

      const updateData = {
        status: 'paid',
        payout_status: 'paid',
        paid_at: new Date().toISOString()
      };
      if (sellerNote) updateData.seller_note = sellerNote;
      if (adminNote) updateData.admin_note = adminNote;

      const { data, error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transactionId)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      // Send notification to seller
      let notificationSent = false;
      if (!skipNotification && data.seller_id) {
        const { data: seller } = await supabase
          .from('sellers')
          .select('email, name, phone')
          .eq('id', data.seller_id)
          .single();

        if (seller?.email) {
          try {
            const metadata = { transactionId: data.id, productTitle: data.product_title, payout: data.seller_payout, paymentMethod: sellerNote };

            // Send email
            const { subject, html } = payoutNotificationEmail(seller.name, data.product_title, data.seller_payout, sellerNote);
            const emailResult = await sendEmail({ sellerId: data.seller_id, to: seller.email, subject, html, context: 'payout_sent', metadata });
            if (emailResult.success) notificationSent = true;

            // Send WhatsApp
            if (seller.phone && !seller.phone.startsWith('NOPHONE')) {
              await sendWhatsApp({
                sellerId: data.seller_id,
                to: seller.phone,
                template: 'payout_sent',
                params: [seller.name || 'there', `$${data.seller_payout?.toFixed(2)}`, data.product_title, sellerNote ? ` via ${sellerNote}` : ''],
                context: 'payout_sent',
                metadata,
                textPreview: `Your payout of $${data.seller_payout?.toFixed(2)} for "${data.product_title}" has been sent.`
              });
            }
          } catch (e) {
            console.error('Payout notification error:', e);
          }
        }
      }

      return res.status(200).json({
        success: true,
        transaction: data,
        notificationSent
      });
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

      const updateData = {
        status: 'paid',
        payout_status: 'paid',
        paid_at: new Date().toISOString()
      };
      if (sellerNote) updateData.payout_method = sellerNote;
      if (adminNote) updateData.admin_note = adminNote;

      const { error: updateErr } = await supabase
        .from('transactions')
        .update(updateData)
        .in('id', validTxs.map(t => t.id));

      if (updateErr) {
        return res.status(400).json({ error: updateErr.message });
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

            // WhatsApp
            if (seller.phone && !seller.phone.startsWith('NOPHONE')) {
              await sendWhatsApp({
                sellerId,
                to: seller.phone,
                textBody: `Hi ${seller.name || 'there'}! Your payout of $${totalPayout.toFixed(2)} for ${txs.length} item(s) has been sent${paymentMethod}. Thank you for selling with The Phir Story!`,
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
      const { sellerId, designer, item_type, size, color, material, condition, original_price, asking_price, description, chest, hip, notes } = req.body;

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
        source: 'admin'
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
      const sellerPayout = Math.round(price * (1 - commissionRate / 100) * 100) / 100;

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
            let sellerEmail = null, sellerId = null, sellerPayout = null, commissionRate = 18;
            try {
              const metafields = await fetchMetafields(productId);
              sellerEmail    = getSellerEmail(metafields);
              sellerId       = getSellerId(metafields);
              sellerPayout   = parseFloat(getMetafieldValue(metafields, 'pricing', 'seller_payout')) || null;
              commissionRate = parseFloat(getMetafieldValue(metafields, 'pricing', 'commission_rate')) || 18;
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

            const salePrice = parseFloat(item.price);
            if (!sellerPayout) sellerPayout = salePrice * ((100 - commissionRate) / 100);

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
              seller_payout:   sellerPayout,
              commission_rate: commissionRate,
              status:          'pending_payout',
              payout_status:   seller ? 'pending_shipping' : 'needs_attention',
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

    return res.status(400).json({ error: 'Invalid action. Use: pending, approve, reject, payouts, transactions, mark-paid, bulk-mark-paid, export-payouts, shipping-alerts, sellers, create, simulate-sale, test-transaction, test-notification, backfill-orders, scrape-url' });

  } catch (error) {
    console.error('Admin listings error:', error);
    return res.status(500).json({ error: error.message });
  }
}

