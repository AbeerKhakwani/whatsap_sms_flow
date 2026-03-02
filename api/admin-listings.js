// api/admin-listings.js
// Consolidated admin listing actions: get-pending, approve, reject

import { approveDraft, getProduct, deleteProduct, getPendingDrafts, getProductCounts, updateProduct } from '../lib/shopify.js';
import { listingApprovedEmail, payoutNotificationEmail, listingRejectedEmail } from '../lib/email.js';
import { sendEmail } from '../lib/send-email.js';
import { sendWhatsApp } from '../lib/send-whatsapp.js';
import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';
import { fetchMetafields, getSellerEmail, getSellerId, getMetafieldValue, extractPricing, upsertMetafield } from '../lib/shopify-metafields.js';
import { resolveSellerFromProduct } from '../lib/seller-lookup.js';

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
        const { commissionRate, sellerPayout } = extractPricing(metafields, variant.price);

        // Find seller in DB (try ID, email, then product ID fallback)
        const seller = await resolveSellerFromProduct(sellerEmail, sellerId, product.id, 'id, name, email, phone');

        return {
          id: product.id,
          shopify_product_id: product.id,
          product_name: product.title,
          designer: product.vendor || 'Unknown Designer',
          size: variant.option1 || 'One Size',
          condition: variant.option3 || 'Good',
          asking_price_usd: parseFloat(variant.price) || 0,
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
      const { shopifyProductId, skipNotification, updates } = req.body;

      if (!shopifyProductId) {
        return res.status(400).json({ error: 'Please provide shopifyProductId' });
      }

      const productBefore = await getProduct(shopifyProductId);

      // Apply updates if provided (description, tags, commission)
      if (updates) {
        const updateData = {};

        if (updates.description) {
          updateData.body_html = `<p>${updates.description}</p>`;
        }

        if (updates.tags) {
          updateData.tags = updates.tags;
        }

        // Update commission metafield if provided
        if (updates.commission !== undefined) {
          const commission = parseInt(updates.commission) || 18;
          const variant = productBefore.variants?.[0];
          const askingPrice = parseFloat(variant?.price) || 0;
          const sellerPayout = (askingPrice - 10) * ((100 - commission) / 100);

          const existingMf = await fetchMetafields(shopifyProductId);
          await upsertMetafield(shopifyProductId, existingMf, 'pricing', 'commission_rate', commission.toString(), 'number_integer');
          await upsertMetafield(shopifyProductId, existingMf, 'pricing', 'seller_payout',
            JSON.stringify({ amount: sellerPayout.toFixed(2), currency_code: 'USD' }), 'money');

          // Update inventory item cost
          if (variant?.inventory_item_id) {
            await fetch(
              `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/inventory_items/${variant.inventory_item_id}.json`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
                },
                body: JSON.stringify({
                  inventory_item: {
                    id: variant.inventory_item_id,
                    cost: sellerPayout.toFixed(2)
                  }
                })
              }
            );
          }
        }

        // Apply the updates to the product
        if (Object.keys(updateData).length > 0) {
          await updateProduct(shopifyProductId, updateData);
        }
      }

      const product = await approveDraft(shopifyProductId);

      // Get seller email + payout from metafields
      let sellerEmail = getSellerEmail(productBefore.metafields);
      const sellerIdMF = getSellerId(productBefore.metafields);

      let sellerPayout;
      if (updates?.commission !== undefined) {
        const commission = parseInt(updates.commission) || 18;
        const variant = productBefore.variants?.[0];
        const askingPrice = parseFloat(variant?.price) || 0;
        sellerPayout = (askingPrice - 10) * ((100 - commission) / 100);
      } else {
        const pricing = extractPricing(productBefore.metafields, productBefore.variants?.[0]?.price);
        sellerPayout = pricing.sellerPayout;
      }
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

        // Send WhatsApp
        if (seller?.phone) {
          await sendWhatsApp({
            sellerId,
            to: seller.phone,
            template: 'listing_approved',
            params: [product.title],
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

      // Find seller from metafields + DB lookup
      let sellerEmail = getSellerEmail(productBefore.metafields);
      const sellerIdMF = getSellerId(productBefore.metafields);
      const seller = await resolveSellerFromProduct(sellerEmail, sellerIdMF, shopifyProductId);
      if (seller && !sellerEmail) sellerEmail = seller.email;

      // Delete the draft
      await deleteProduct(shopifyProductId);

      // Send notifications if we found the seller
      if (!skipNotification && seller && reason) {
        const metadata = { productId: shopifyProductId, productTitle, reason, note };

        // Send email
        const { subject, html } = listingRejectedEmail(seller.name, productTitle, reason, note || null);
        await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'listing_rejected', metadata });

        // Send WhatsApp (text message — no rejection template)
        if (seller.phone && !seller.phone.startsWith('NOPHONE') && !seller.phone.startsWith('RESET_')) {
          const waMessage = `Hi${seller.name ? ` ${seller.name}` : ''}! We reviewed your listing "${productTitle}" but can't approve it at this time.\n\nReason: ${reason}${note ? `\n${note}` : ''}\n\nYou're welcome to submit a new listing addressing these concerns. Questions? Just reply here!`;
          await sendWhatsApp({
            sellerId: seller.id,
            to: seller.phone,
            textBody: waMessage,
            context: 'listing_rejected',
            metadata
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Listing rejected and notifications sent',
        notificationSent: !skipNotification && !!seller
      });
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
        return res.status(400).json({ error: 'sellerEmail and type required. Types: listing_approved, item_sold, payout_sent' });
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
        let templateName, templateParams;
        if (type === 'listing_approved') {
          templateName = 'listing_approved';
          templateParams = [testData.productTitle];
        } else if (type === 'item_sold') {
          templateName = 'item_sold';
          templateParams = [testData.productTitle, testData.salePrice.toFixed(0)];
        } else if (type === 'payout_sent') {
          templateName = 'payout_sent';
          templateParams = [seller.name || 'there', `$${testData.sellerPayout.toFixed(2)}`, testData.productTitle, ' via PayPal'];
        }

        if (templateName) {
          const waResult = await sendWhatsApp({
            sellerId: seller.id,
            to: seller.phone,
            template: templateName,
            params: templateParams,
            context: type,
            metadata: testMeta,
            textPreview: `[TEST] ${type} notification`
          });
          results.whatsapp = waResult.success ? 'sent' : waResult.error || 'failed';
        }
      }

      // Send Email
      if (seller.email) {
        let emailTemplate;
        if (type === 'listing_approved') {
          emailTemplate = listingApprovedEmail(seller.name, testData.productTitle, testData.productUrl, testData.sellerPayout);
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

    return res.status(400).json({ error: 'Invalid action. Use: pending, approve, reject, payouts, transactions, mark-paid, bulk-mark-paid, export-payouts, shipping-alerts, test-transaction, test-notification' });

  } catch (error) {
    console.error('Admin listings error:', error);
    return res.status(500).json({ error: error.message });
  }
}

