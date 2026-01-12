// api/admin-listings.js
// Consolidated admin listing actions: get-pending, approve, reject

import { approveDraft, getProduct, deleteProduct, getPendingDrafts, getProductCounts, updateProduct } from '../lib/shopify.js';
import { sendListingApproved, sendPayoutNotification, sendListingRejected } from '../lib/email.js';
import { logMessage } from '../lib/messages.js';
import { getSellerEmail, getSellerPayout } from '../lib/metafield-helpers.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const STORE_URL = process.env.VITE_SHOPIFY_STORE_URL?.replace('.myshopify.com', '');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

        // Fetch metafields to get seller email
        const productWithMetafields = await getProduct(product.id, true);
        const sellerEmail = getSellerEmail(productWithMetafields);
        const sellerPayout = getSellerPayout(productWithMetafields) || 0;

        // Get commission rate from metafields
        const commissionMetafield = productWithMetafields.metafields?.find(m => m.namespace === 'pricing' && m.key === 'commission_rate');
        const commissionRate = commissionMetafield?.value ? parseInt(commissionMetafield.value) : 18;

        let seller = null;
        if (sellerEmail) {
          const { data } = await supabase
            .from('sellers')
            .select('id, name, email, phone')
            .ilike('email', sellerEmail.toLowerCase())
            .maybeSingle();
          seller = data;
        }

        // Fallback: find seller who has this product in their shopify_product_ids
        if (!seller) {
          const { data } = await supabase
            .from('sellers')
            .select('id, name, email, phone')
            .contains('shopify_product_ids', [product.id.toString()])
            .maybeSingle();
          seller = data;
        }

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
          const sellerPayout = (askingPrice - 10) * ((100 - commission) / 100); // Subtract $10 fee, then apply commission

          // Update metafields via REST API
          await fetch(
            `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${shopifyProductId}/metafields.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
              },
              body: JSON.stringify({
                metafield: {
                  namespace: 'pricing',
                  key: 'commission_rate',
                  value: commission.toString(),
                  type: 'number_integer'
                }
              })
            }
          );

          await fetch(
            `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${shopifyProductId}/metafields.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
              },
              body: JSON.stringify({
                metafield: {
                  namespace: 'pricing',
                  key: 'seller_payout',
                  value: JSON.stringify({
                    amount: sellerPayout.toFixed(2),
                    currency_code: 'USD'
                  }),
                  type: 'money'
                }
              })
            }
          );

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

      // Try metafield first, then fall back to Supabase lookup
      let sellerEmail = getSellerEmail(productBefore);

      // Get updated payout if commission was changed
      let sellerPayout;
      if (updates?.commission !== undefined) {
        const commission = parseInt(updates.commission) || 18;
        const variant = productBefore.variants?.[0];
        const askingPrice = parseFloat(variant?.price) || 0;
        sellerPayout = (askingPrice - 10) * ((100 - commission) / 100);
      } else {
        sellerPayout = getSellerPayout(productBefore) || 0;
      }
      const productUrl = `https://${STORE_URL}.com/products/${product.handle}`;

      let seller = null;

      // First try: lookup by metafield email
      if (sellerEmail) {
        const { data } = await supabase
          .from('sellers')
          .select('*')
          .ilike('email', sellerEmail.toLowerCase())
          .maybeSingle();
        seller = data;
      }

      // Fallback: find seller who has this product in their shopify_product_ids
      if (!seller) {
        const { data } = await supabase
          .from('sellers')
          .select('*')
          .contains('shopify_product_ids', [shopifyProductId.toString()])
          .maybeSingle();
        seller = data;
        if (seller) {
          sellerEmail = seller.email;
          console.log(`📧 Found seller via product ID lookup: ${seller.email}`);
        }
      }

      if (!skipNotification && sellerEmail) {
        try {
          const emailSent = await sendListingApproved(sellerEmail, seller?.name || null, product.title, productUrl, sellerPayout);
          if (emailSent && seller?.id) {
            await logMessage({
              sellerId: seller.id,
              type: 'email',
              recipient: sellerEmail,
              subject: 'Your listing is now live!',
              content: `Listing "${product.title}" approved. Payout: $${sellerPayout.toFixed(2)}. View: ${productUrl}`,
              context: 'listing_approved',
              metadata: { productId: product.id, productTitle: product.title, payout: sellerPayout }
            });
          }
        } catch (e) { console.error('Email error:', e); }

        if (seller?.phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
          try {
            const waMessage = `${seller.name ? `Hi ${seller.name}! ` : ''}Great news! Your listing "${product.title}" is now live on The Phir Story.\n\nWhen it sells, you'll receive $${sellerPayout.toFixed(2)}.\n\nView: ${productUrl}`;
            const waSent = await sendWhatsAppApproval(seller.phone, seller.name, product.title, productUrl, sellerPayout);
            if (waSent) {
              await logMessage({
                sellerId: seller.id,
                type: 'whatsapp',
                recipient: seller.phone,
                content: waMessage,
                context: 'listing_approved',
                metadata: { productId: product.id, productTitle: product.title, payout: sellerPayout }
              });
            }
          } catch (e) { console.error('WhatsApp error:', e); }
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

      // Try metafield first, then fall back to Supabase lookup
      let sellerEmail = getSellerEmail(productBefore);
      let seller = null;

      // First try: lookup by metafield email
      if (sellerEmail) {
        const { data } = await supabase
          .from('sellers')
          .select('*')
          .ilike('email', sellerEmail.toLowerCase())
          .maybeSingle();
        seller = data;
      }

      // Fallback: find seller who has this product in their shopify_product_ids
      if (!seller) {
        const { data } = await supabase
          .from('sellers')
          .select('*')
          .contains('shopify_product_ids', [shopifyProductId.toString()])
          .maybeSingle();
        seller = data;
        if (seller) {
          sellerEmail = seller.email;
          console.log(`📧 Found seller via product ID lookup: ${seller.email}`);
        }
      }

      // Delete the draft
      await deleteProduct(shopifyProductId);

      // Send notifications if we found the seller
      if (!skipNotification && seller && reason) {
        // Send email
        try {
          const emailSent = await sendListingRejected(
            seller.email,
            seller.name,
            productTitle,
            reason,
            note || null
          );

          if (emailSent) {
            await logMessage({
              sellerId: seller.id,
              type: 'email',
              recipient: seller.email,
              subject: 'Update on your listing',
              content: `Listing "${productTitle}" was not approved. Reason: ${reason}${note ? ` - ${note}` : ''}`,
              context: 'listing_rejected',
              metadata: { productId: shopifyProductId, productTitle, reason, note }
            });
          }
        } catch (e) {
          console.error('Rejection email error:', e);
        }

        // Send WhatsApp if seller has phone
        if (seller.phone && !seller.phone.startsWith('NOPHONE') && !seller.phone.startsWith('RESET_') && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
          try {
            const to = seller.phone.replace(/\D/g, '');
            const waMessage = `Hi${seller.name ? ` ${seller.name}` : ''}! We reviewed your listing "${productTitle}" but can't approve it at this time.\n\nReason: ${reason}${note ? `\n${note}` : ''}\n\nYou're welcome to submit a new listing addressing these concerns. Questions? Just reply here!`;

            const waRes = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: waMessage }
              })
            });

            if (waRes.ok) {
              await logMessage({
                sellerId: seller.id,
                type: 'whatsapp',
                recipient: seller.phone,
                content: waMessage,
                context: 'listing_rejected',
                metadata: { productId: shopifyProductId, productTitle, reason, note }
              });
            }
          } catch (e) {
            console.error('WhatsApp rejection error:', e);
          }
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
        .select('id, name, email, phone')
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
      const status = req.query.status; // optional filter: pending_payout, paid

      let query = supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data: transactions, error } = await query;

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      // Get seller details for each transaction
      const sellerIds = [...new Set((transactions || []).map(t => t.seller_id))];
      const { data: sellers } = await supabase
        .from('sellers')
        .select('id, name, email, phone')
        .in('id', sellerIds);

      const sellersById = {};
      for (const s of sellers || []) {
        sellersById[s.id] = s;
      }

      const enriched = (transactions || []).map(t => ({
        ...t,
        seller: sellersById[t.seller_id] || null
      }));

      // Calculate totals
      const pending = enriched.filter(t => t.status === 'pending_payout');
      const paid = enriched.filter(t => t.status === 'paid');

      return res.status(200).json({
        success: true,
        transactions: enriched,
        stats: {
          totalPending: pending.reduce((sum, t) => sum + (t.seller_payout || 0), 0),
          totalPaid: paid.reduce((sum, t) => sum + (t.seller_payout || 0), 0),
          pendingCount: pending.length,
          paidCount: paid.length
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
            const paymentMethod = sellerNote ? ` (${sellerNote})` : '';
            const emailContent = `Payout of $${data.seller_payout?.toFixed(2)} for "${data.product_title}" has been sent${paymentMethod}.`;

            const emailSent = await sendPayoutNotification(
              seller.email,
              seller.name,
              data.product_title,
              data.seller_payout,
              sellerNote
            );

            if (emailSent) {
              notificationSent = true;
              await logMessage({
                sellerId: data.seller_id,
                type: 'email',
                recipient: seller.email,
                subject: 'Your payout has been sent!',
                content: emailContent,
                context: 'payout_sent',
                metadata: { transactionId: data.id, productTitle: data.product_title, payout: data.seller_payout, paymentMethod: sellerNote }
              });
            }

            // Also send WhatsApp if seller has phone
            if (seller.phone && !seller.phone.startsWith('NOPHONE') && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
              const to = seller.phone.replace(/\D/g, '');
              const waMessage = `Hi ${seller.name || 'there'}! Your payout of $${data.seller_payout?.toFixed(2)} for "${data.product_title}" has been sent${paymentMethod}.`;

              const waRes = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to,
                  type: 'template',
                  template: {
                    name: 'payout_sent',
                    language: { code: 'en_US' },
                    components: [
                      {
                        type: 'body',
                        parameters: [
                          { type: 'text', text: seller.name || 'there' },
                          { type: 'text', text: `$${data.seller_payout?.toFixed(2)}` },
                          { type: 'text', text: data.product_title },
                          { type: 'text', text: sellerNote ? ` via ${sellerNote}` : '' }
                        ]
                      }
                    ]
                  }
                })
              });

              if (waRes.ok) {
                await logMessage({
                  sellerId: data.seller_id,
                  type: 'whatsapp',
                  recipient: seller.phone,
                  content: waMessage,
                  context: 'payout_sent',
                  metadata: { transactionId: data.id, productTitle: data.product_title, payout: data.seller_payout, paymentMethod: sellerNote }
                });
              }
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

      // Send WhatsApp
      if (seller.phone && !seller.phone.startsWith('NOPHONE') && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        try {
          const phone = seller.phone.replace(/\D/g, '');
          let templateName, parameters;

          if (type === 'listing_approved') {
            // Template: "Your {{1}} has been approved and is now live on The Phir Story! 🎉"
            templateName = 'listing_approved';
            parameters = [
              { type: 'text', text: testData.productTitle }
            ];
          } else if (type === 'item_sold') {
            // Template: "Great news! 🎉 Your {{1}} just sold for ${{2}}! We'll send your earnings within 5 business days."
            templateName = 'item_sold';
            parameters = [
              { type: 'text', text: testData.productTitle },
              { type: 'text', text: testData.salePrice.toFixed(0) }
            ];
          } else if (type === 'payout_sent') {
            templateName = 'payout_sent';
            parameters = [
              { type: 'text', text: seller.name || 'there' },
              { type: 'text', text: `$${testData.sellerPayout.toFixed(2)}` },
              { type: 'text', text: testData.productTitle },
              { type: 'text', text: ' via PayPal' }
            ];
          }

          const waRes = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phone,
              type: 'template',
              template: {
                name: templateName,
                language: { code: 'en_US' },
                components: [{ type: 'body', parameters }]
              }
            })
          });

          const waData = await waRes.json();
          results.whatsapp = waRes.ok ? 'sent' : waData.error?.message || 'failed';

          if (waRes.ok) {
            await logMessage({
              sellerId: seller.id,
              type: 'whatsapp',
              recipient: seller.phone,
              content: `[TEST] ${type} notification`,
              context: type,
              metadata: { test: true, ...testData }
            });
          }
        } catch (e) {
          results.whatsapp = e.message;
        }
      }

      // Send Email (using Resend)
      if (seller.email) {
        try {
          if (type === 'listing_approved') {
            const sent = await sendListingApproved(seller.email, seller.name, testData.productTitle, testData.productUrl, testData.sellerPayout);
            results.email = sent ? 'sent' : 'failed';
          } else if (type === 'payout_sent') {
            const sent = await sendPayoutNotification(seller.email, seller.name, testData.productTitle, testData.sellerPayout, 'PayPal (test)');
            results.email = sent ? 'sent' : 'failed';
          } else {
            results.email = 'no email template for this type';
          }

          if (results.email === 'sent') {
            await logMessage({
              sellerId: seller.id,
              type: 'email',
              recipient: seller.email,
              subject: `[TEST] ${type}`,
              content: `Test ${type} notification`,
              context: type,
              metadata: { test: true, ...testData }
            });
          }
        } catch (e) {
          results.email = e.message;
        }
      }

      return res.status(200).json({
        success: true,
        message: `Test ${type} notification sent`,
        results,
        seller: { name: seller.name, email: seller.email, phone: seller.phone }
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use: pending, approve, reject, payouts, mark-paid, test-transaction, test-notification' });

  } catch (error) {
    console.error('Admin listings error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function sendWhatsAppApproval(phone, name, title, url, payout) {
  // Template: "Your {{1}} has been approved and is now live on The Phir Story! 🎉"
  // Only 1 parameter: product title
  const to = phone.replace(/\D/g, '');

  const res = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: 'listing_approved',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: title }
            ]
          }
        ]
      }
    })
  });
  return res.ok;
}
