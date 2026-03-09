// api/seller.js
// Seller endpoints - no auth for now, just email-based lookup
// Also handles Shopify order webhooks

import crypto from 'crypto';
import { getProduct, updateProduct, fulfillOrder } from '../lib/shopify.js';
import { validateUpdate } from '../lib/security.js';
import { getShippingLabel, getShippingInstructions, WAREHOUSE_ADDRESS } from '../lib/shipping.js';
import { getSellerMessages } from '../lib/messages.js';
import { sendEmail } from '../lib/send-email.js';
import { sendWhatsApp } from '../lib/send-whatsapp.js';
import { itemSoldInlineEmail, shippingLabelEmail, sendTransferFromNotification, sendTransferToNotification } from '../lib/email.js';
import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';
import { fetchMetafields, fetchMetafieldsBatch, extractPricing, getMetafieldValue, getSellerEmail, getSellerId, upsertMetafield, updatePricingMetafields } from '../lib/shopify-metafields.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const { action } = req.query;

  try {
    // GET LISTINGS by email
    if (action === 'listings' && req.method === 'GET') {
      const email = req.query.email?.toLowerCase();

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      // Find seller by email
      const { data: seller } = await supabase
        .from('sellers')
        .select('*')
        .eq('email', email)
        .single();

      if (!seller) {
        return res.status(200).json({
          success: true,
          listings: [],
          stats: { total: 0, draft: 0, active: 0, sold: 0 },
          seller: null
        });
      }

      // Get historical products from seller record
      const historicalProducts = seller.products || [];
      const soldProducts = historicalProducts.filter(p => p.status?.includes('SOLD'));

      const productIds = seller.shopify_product_ids || [];

      if (productIds.length === 0 && historicalProducts.length === 0) {
        return res.status(200).json({
          success: true,
          listings: [],
          stats: { total: 0, draft: 0, active: 0, sold: 0 },
          seller: {
            name: seller.name,
            email: seller.email,
            commissionRate: seller.commission_rate || 50,
            totalEarnings: 0,
            pendingPayout: 0
          }
        });
      }

      const listings = [];
      let stats = { total: 0, draft: 0, active: 0, sold: 0 };

      // BATCH FETCH: Get all products in one API call
      const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
      const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

      const productsRes = await fetch(
        `https://${SHOPIFY_URL}/admin/api/2024-10/products.json?ids=${productIds.join(',')}&limit=250`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      );
      const { products } = await productsRes.json();

      // PARALLEL FETCH: Get all metafields at once
      const metafieldsByProduct = await fetchMetafieldsBatch((products || []).map(p => p.id));

      // Process all products
      for (const product of products || []) {
        const variant = product.variants?.[0] || {};
        const metafields = metafieldsByProduct[product.id] || [];

        // Extract pricing from metafields
        const price = parseFloat(variant.price) || 0;
        const { commissionRate, sellerAskingPrice, sellerPayout } = extractPricing(metafields, price);

        // Check if sold (0 inventory, but not if delisted)
        const inventory = variant.inventory_quantity ?? 0;
        const isDelisted = product.tags?.includes('delisted');
        const isSold = !isDelisted && (inventory === 0 && product.status === 'archived');

        listings.push({
          id: product.id,
          title: product.title,
          handle: product.handle,
          designer: product.vendor || 'Unknown',
          status: product.status,
          price,
          size: variant.option1 || 'One Size',
          condition: variant.option3 || 'Good',
          image: product.images?.[0]?.src || null,
          images: product.images?.map(img => ({ id: img.id, src: img.src })) || [],
          description: product.body_html?.replace(/<[^>]*>/g, ' ').trim() || '',
          tags: product.tags?.split(', ') || [],
          created_at: product.created_at,
          updated_at: product.updated_at,
          commissionRate,
          sellerAskingPrice,
          sellerPayout,
          inventory,
          isSold
        });
        stats.total++;

        if (isSold) stats.sold++;
        else if (isDelisted) { /* delisted items don't count in active/draft */ }
        else if (product.status === 'draft') stats.draft++;
        else if (product.status === 'active') stats.active++;
      }

      listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Get transactions from database (source of truth for sold items)
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('seller_id', seller.id)
        .order('created_at', { ascending: false });

      // Build sold products from transactions
      const allSoldProducts = (transactions || []).map(tx => ({
        id: tx.id,
        title: tx.product_title,
        retailPrice: tx.sale_price,
        splitPercent: 100 - tx.commission_rate,
        earnings: tx.seller_payout,
        dateSold: tx.created_at,
        status: tx.status === 'paid' ? 'SOLD_WITH_PAYOUT' : 'SOLD_WITHOUT_PAYOUT',
        brand: null,
        orderName: tx.order_name,
        paidAt: tx.paid_at,
        paymentNote: tx.seller_note,
        // Shipping info
        shippingStatus: tx.shipping_status || 'pending_label',
        shippingLabelUrl: tx.shipping_label_url,
        trackingNumber: tx.tracking_number,
        carrier: tx.carrier,
        shippingService: tx.shipping_service,
        fulfilledAt: tx.fulfilled_at,
        // Payout lifecycle
        payoutStatus: tx.payout_status || 'pending_shipping',
        shipBy: tx.ship_by,
        deliveredAt: tx.delivered_at,
        contestWindowEnds: tx.contest_window_ends,
        image: tx.product_image
      }));

      // Calculate balance breakdown by payout status
      const balanceBreakdown = {
        pendingShipping: 0,
        inTransit: 0,
        delivered: 0,
        available: 0,
        paid: 0,
        contested: 0
      };

      for (const tx of transactions || []) {
        const amount = tx.seller_payout || 0;
        const payoutStatus = tx.payout_status || (tx.status === 'paid' ? 'paid' : 'pending_shipping');

        switch (payoutStatus) {
          case 'pending_shipping':
            balanceBreakdown.pendingShipping += amount;
            break;
          case 'in_transit':
            balanceBreakdown.inTransit += amount;
            break;
          case 'delivered':
            balanceBreakdown.delivered += amount;
            break;
          case 'available':
            balanceBreakdown.available += amount;
            break;
          case 'paid':
            balanceBreakdown.paid += amount;
            break;
          case 'contested':
            balanceBreakdown.contested += amount;
            break;
        }
      }

      // Calculate earnings from transactions
      const totalEarnings = (transactions || [])
        .filter(tx => tx.status === 'paid')
        .reduce((sum, tx) => sum + (tx.seller_payout || 0), 0);

      const pendingPayout = (transactions || [])
        .filter(tx => tx.status !== 'paid')
        .reduce((sum, tx) => sum + (tx.seller_payout || 0), 0);

      return res.status(200).json({
        success: true,
        listings,
        stats: {
          ...stats,
          sold: allSoldProducts.length
        },
        seller: {
          name: seller.name,
          email: seller.email,
          commissionRate: seller.commission_rate || 18,
          totalEarnings,
          pendingPayout
        },
        soldProducts: allSoldProducts,
        balanceBreakdown
      });
    }

    // UPDATE LISTING
    if (action === 'update' && (req.method === 'PUT' || req.method === 'POST')) {
      const { email, productId, title, price, description, condition } = req.body;

      if (!email || !productId) {
        return res.status(400).json({ error: 'Email and product ID required' });
      }

      // AI Security Validation
      const validation = await validateUpdate({
        title,
        description,
        condition,
        price
      });

      if (!validation.valid) {
        return res.status(400).json({
          error: validation.message,
          issues: validation.issues
        });
      }

      const safeData = validation.data;

      // Verify seller owns this product
      const { data: seller } = await supabase
        .from('sellers')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      const productIds = seller.shopify_product_ids || [];
      if (!productIds.includes(productId.toString()) && !productIds.includes(productId)) {
        return res.status(403).json({ error: 'Not authorized to edit this listing' });
      }

      const updates = {};
      if (safeData.title) updates.title = safeData.title;
      if (safeData.description !== undefined) updates.body_html = safeData.description;

      // Get current product to update variant
      const product = await getProduct(productId);
      const variant = product.variants?.[0];

      if (variant) {
        const variantUpdates = { id: variant.id };
        if (safeData.price !== undefined) variantUpdates.price = safeData.price.toString();
        if (safeData.condition) variantUpdates.option3 = safeData.condition;

        if (Object.keys(variantUpdates).length > 1) {
          await fetch(
            `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/variants/${variant.id}.json`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
              },
              body: JSON.stringify({ variant: variantUpdates })
            }
          );
        }

        // If price changed, update pricing metafields
        if (safeData.price !== undefined) {
          await updatePricingMetafields(productId, safeData.price, seller.commission_rate || 18);
        }
      }

      let updatedProduct;
      if (Object.keys(updates).length > 0) {
        updatedProduct = await updateProduct(productId, updates);
      } else {
        updatedProduct = await getProduct(productId);
      }

      // Get updated payout for response - re-fetch metafields for accurate data
      const finalPrice = parseFloat(updatedProduct.variants?.[0]?.price) || 0;
      const finalMf = await fetchMetafields(productId);
      const { sellerAskingPrice, sellerPayout } = extractPricing(finalMf, finalPrice);

      return res.status(200).json({
        success: true,
        listing: {
          id: updatedProduct.id,
          title: updatedProduct.title,
          price: finalPrice,
          sellerAskingPrice,
          sellerPayout,
          condition: updatedProduct.variants?.[0]?.option3,
          description: updatedProduct.body_html,
          status: updatedProduct.status
        }
      });
    }

    // RESET AUTH (for testing - makes it like they never texted before)
    if (action === 'reset-auth' && req.method === 'POST') {
      const { sellerId } = req.body;

      if (!sellerId) {
        return res.status(400).json({ error: 'Seller ID required' });
      }

      const errors = [];

      // Get seller's phone and email
      const { data: seller } = await supabase
        .from('sellers')
        .select('phone, email')
        .eq('id', sellerId)
        .single();

      // Delete WhatsApp session for this phone
      if (seller?.phone) {
        const { error: sessionError } = await supabase
          .from('whatsapp_sessions')
          .delete()
          .eq('phone', seller.phone);

        if (sessionError) {
          console.error('Delete WhatsApp session error:', sessionError);
          errors.push(`whatsapp_sessions: ${sessionError.message}`);
        }
      }

      // Delete SMS conversation for this phone
      if (seller?.phone) {
        const { error: convError } = await supabase
          .from('sms_conversations')
          .delete()
          .eq('phone_number', seller.phone);

        if (convError) {
          console.error('Delete conversations error:', convError);
          errors.push(`sms_conversations: ${convError.message}`);
        }
      }

      // Delete auth codes for this email
      if (seller?.email) {
        const { error: authError } = await supabase
          .from('auth_codes')
          .delete()
          .eq('identifier', seller.email.toLowerCase());

        if (authError) {
          console.error('Delete auth codes error:', authError);
          errors.push(`auth_codes: ${authError.message}`);
        }
      }

      // Clear phone from seller so findSellerByPhone won't find them
      const { error: sellerError } = await supabase
        .from('sellers')
        .update({ phone: '' })
        .eq('id', sellerId);

      if (sellerError) {
        console.error('Clear phone error:', sellerError);
        errors.push(`seller phone: ${sellerError.message}`);
      }

      if (errors.length > 0) {
        return res.status(200).json({
          success: true,
          warning: `Partial reset: ${errors.join(', ')}`,
          message: 'Reset attempted with some issues'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Full reset - seller will experience first-time flow'
      });
    }

    // GET PRODUCTS BY IDS (for admin dashboard)
    if (action === 'products' && req.method === 'GET') {
      const ids = req.query.ids?.split(',').filter(Boolean).slice(0, 50);

      if (!ids || ids.length === 0) {
        return res.status(400).json({ error: 'Product IDs required' });
      }

      // BATCH FETCH: Get all products in one API call
      const productsRes = await fetch(
        `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products.json?ids=${ids.join(',')}&limit=250`,
        { headers: { 'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN } }
      );
      const { products: shopifyProducts } = await productsRes.json();

      // PARALLEL FETCH: Get all metafields at once
      const metafieldsByProduct = await fetchMetafieldsBatch((shopifyProducts || []).map(p => p.id));

      // Process all products
      const products = (shopifyProducts || []).map(product => {
        const variant = product.variants?.[0] || {};
        const metafields = metafieldsByProduct[product.id] || [];

        const price = parseFloat(variant.price) || 0;
        const { commissionRate, sellerAskingPrice, sellerPayout } = extractPricing(metafields, price);

        const inventory = variant.inventory_quantity ?? 0;
        const isSold = inventory === 0 && product.status === 'active';

        return {
          id: product.id,
          title: product.title,
          status: product.status,
          price,
          size: variant.option1 || 'One Size',
          condition: variant.option3 || 'Good',
          image: product.images?.[0]?.src || null,
          created_at: product.created_at,
          inventory,
          isSold,
          commissionRate,
          sellerAskingPrice,
          sellerPayout
        };
      });

      return res.status(200).json({ success: true, products });
    }

    // SHOPIFY ORDER WEBHOOK - called when order is paid
    if (action === 'order-paid' && req.method === 'POST') {
      // Verify webhook signature
      const hmacHeader = req.headers['x-shopify-hmac-sha256'];
      const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;

      if (webhookSecret && hmacHeader) {
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const generatedHmac = crypto
          .createHmac('sha256', webhookSecret)
          .update(rawBody, 'utf8')
          .digest('base64');

        if (hmacHeader !== generatedHmac) {
          console.error('Invalid webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      const order = req.body;
      console.log(`💰 Processing paid order: ${order.name}`);
      const results = [];

      for (const item of order.line_items || []) {
        const productId = item.product_id;
        if (!productId) continue;

        try {
          // Fetch metafields for seller info + pricing
          let sellerEmail = null;
          let sellerId = null;
          let sellerPayout = null;
          let commissionRate = 18;
          let listingType = 'regular';
          let productTitle = item.title; // Use line_item title (always available from webhook)

          try {
            const metafields = await fetchMetafields(productId);
            sellerEmail = getSellerEmail(metafields);
            sellerId = getSellerId(metafields);
            sellerPayout = parseFloat(getMetafieldValue(metafields, 'pricing', 'seller_payout')) || null;
            commissionRate = parseFloat(getMetafieldValue(metafields, 'pricing', 'commission_rate')) || 18;
            const listingTypeVal = getMetafieldValue(metafields, 'seller', 'listing_type');
            if (listingTypeVal) listingType = listingTypeVal;
          } catch (e) {
            console.log('Could not fetch metafields:', e.message);
          }

          // Find seller in database (if we have info)
          let seller = null;
          let sellerMissing = false;

          if (sellerId) {
            const { data } = await supabase.from('sellers').select('*').eq('id', sellerId).single();
            seller = data;
          } else if (sellerEmail) {
            const { data } = await supabase.from('sellers').select('*').eq('email', sellerEmail.toLowerCase()).single();
            seller = data;
          }

          if (!seller) {
            sellerMissing = true;
            console.log(`   ⚠️ Seller not found for product ${productId} — creating transaction anyway`);
          }

          // Check if transaction already exists
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id')
            .eq('order_id', order.id.toString())
            .eq('product_id', productId.toString())
            .maybeSingle();

          if (existingTx) {
            console.log(`   Transaction already exists for order ${order.id}, product ${productId}`);
            continue;
          }

          // Calculate payout if not in metafields
          const salePrice = parseFloat(item.price);
          if (!sellerPayout) {
            sellerPayout = salePrice * ((100 - commissionRate) / 100);
          }

          // Extract buyer shipping address from order
          const buyerAddress = order.shipping_address ? {
            name: order.shipping_address.name,
            street1: order.shipping_address.address1,
            street2: order.shipping_address.address2 || '',
            city: order.shipping_address.city,
            state: order.shipping_address.province_code,
            zip: order.shipping_address.zip,
            country: order.shipping_address.country_code || 'US',
            phone: order.shipping_address.phone || ''
          } : null;

          // Create transaction record
          const now = new Date();
          const shipBy = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days to ship

          const transaction = {
            seller_id: seller?.id || null,
            order_id: order.id.toString(),
            order_name: order.name,
            product_id: productId.toString(),
            product_title: productTitle,
            sale_price: salePrice,
            seller_payout: sellerPayout,
            commission_rate: commissionRate,
            status: 'pending_payout',
            payout_status: sellerMissing ? 'needs_attention' : 'pending_shipping',
            shipping_status: sellerMissing ? 'needs_attention' : 'pending_label',
            listing_type: listingType,
            customer_email: order.email,
            buyer_address: buyerAddress,
            ship_by: shipBy.toISOString(),
            created_at: now.toISOString(),
            admin_note: sellerMissing
              ? `⚠️ SELLER NOT FOUND — email: ${sellerEmail || 'none'}, id: ${sellerId || 'none'}`
              : null
          };

          const { data: newTx, error: txError } = await supabase
            .from('transactions')
            .insert(transaction)
            .select()
            .single();

          if (txError) {
            console.error(`   Failed to create transaction:`, txError);
            continue;
          }

          if (sellerMissing) {
            console.log(`   ⚠️ Created transaction for ${item.title} | SELLER MISSING | Payout: $${sellerPayout}`);
            results.push({ sellerId: null, productId, payout: sellerPayout, sellerMissing: true });
          } else {
            console.log(`   ✅ Created transaction for ${item.title} | Seller: ${seller.email} | Payout: $${sellerPayout}`);

            // Notify seller — they'll generate their shipping label from the dashboard
            await notifySellerOfSale(seller, {
              productTitle,
              salePrice,
              sellerPayout
            });

            results.push({ sellerId: seller.id, productId, payout: sellerPayout });
          }

        } catch (err) {
          console.error(`   Error processing product ${productId}:`, err.message);
        }
      }

      return res.status(200).json({
        success: true,
        processed: results.length,
        results
      });
    }

    // GET SHIPPING LABEL or instructions
    if (action === 'shipping-label' && req.method === 'POST') {
      const { email, productId, productTitle, transactionId, buyerAddress } = req.body;
      console.log('📦 shipping-label request:', { email, productTitle, transactionId, hasBuyerAddress: !!buyerAddress });

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const { data: seller } = await supabase
        .from('sellers')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Check if seller has shipping address
      if (!seller.shipping_address) {
        return res.status(400).json({
          error: 'Please add your shipping address in your profile first',
          needsAddress: true
        });
      }

      try {
        // Format seller address for shipping API
        const sellerForShipping = {
          name: seller.shipping_address.full_name || seller.name,
          address_line1: seller.shipping_address.street_address,
          address_line2: seller.shipping_address.apartment || '',
          city: seller.shipping_address.city,
          state: seller.shipping_address.state,
          zip: seller.shipping_address.postal_code,
          phone: seller.phone || ''
        };
        console.log('📦 Seller address:', sellerForShipping);

        // Get buyer address from transaction if not provided
        let finalBuyerAddress = buyerAddress;
        if (!finalBuyerAddress && transactionId) {
          const { data: tx, error: txError } = await supabase
            .from('transactions')
            .select('buyer_address, order_id')
            .eq('id', transactionId)
            .single();

          console.log('📦 Transaction lookup:', { transactionId, tx: tx ? { buyer_address: !!tx.buyer_address, order_id: tx.order_id } : null, txError });
          finalBuyerAddress = tx?.buyer_address;

          // If no buyer address stored, try to get from Shopify order
          if (!finalBuyerAddress && tx?.order_id) {
            console.log('📦 No buyer address in transaction, fetching from Shopify order:', tx.order_id);
            try {
              const orderRes = await fetch(
                `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/orders/${tx.order_id}.json`,
                { headers: { 'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN } }
              );
              const orderData = await orderRes.json();
              const shippingAddr = orderData.order?.shipping_address;

              if (shippingAddr) {
                finalBuyerAddress = {
                  name: shippingAddr.name,
                  street1: shippingAddr.address1,
                  street2: shippingAddr.address2 || '',
                  city: shippingAddr.city,
                  state: shippingAddr.province_code,
                  zip: shippingAddr.zip,
                  country: shippingAddr.country_code || 'US',
                  phone: shippingAddr.phone || ''
                };

                // Save it to transaction for next time
                await supabase
                  .from('transactions')
                  .update({ buyer_address: finalBuyerAddress })
                  .eq('id', transactionId);

                console.log('📦 Fetched and saved buyer address from Shopify');
              }
            } catch (shopifyErr) {
              console.error('📦 Failed to fetch Shopify order:', shopifyErr.message);
            }
          }
        }

        if (!finalBuyerAddress) {
          return res.status(400).json({
            error: 'This is an older order from before shipping labels were enabled. The buyer\'s address is not on file. New orders will have labels available automatically.',
            needsBuyerAddress: true
          });
        }

        console.log('📦 Generating label:', { seller: sellerForShipping.name, buyer: finalBuyerAddress.name });
        const labelResult = await getShippingLabel(sellerForShipping, productTitle, finalBuyerAddress);

        // If we got a real label and have a transaction ID, update the transaction
        if (labelResult.labelUrl && transactionId) {
          // Get the order_id for Shopify fulfillment
          const { data: txForFulfill } = await supabase
            .from('transactions')
            .select('order_id')
            .eq('id', transactionId)
            .single();

          await supabase
            .from('transactions')
            .update({
              shipping_label_url: labelResult.labelUrl,
              tracking_number: labelResult.trackingNumber,
              carrier: labelResult.carrier || 'USPS',
              shipping_service: labelResult.service,
              shipping_status: 'label_created',
              payout_status: 'in_transit'
            })
            .eq('id', transactionId)
            .eq('seller_id', seller.id);

          // Fulfill the Shopify order to notify the buyer
          if (txForFulfill?.order_id && labelResult.trackingNumber) {
            try {
              await fulfillOrder(txForFulfill.order_id, {
                tracking_number: labelResult.trackingNumber,
                carrier: labelResult.carrier || 'USPS'
              });
              console.log('📦 Shopify order fulfilled - buyer will receive tracking notification');
            } catch (fulfillErr) {
              console.error('📦 Shopify fulfillment failed (non-blocking):', fulfillErr.message);
              // Don't fail the request - label was created successfully
            }
          }
        }

        // If we got a real label, send it via WhatsApp/email
        if (labelResult.labelUrl) {
          await sendShippingLabel(seller, labelResult, productTitle);
        }

        return res.status(200).json({
          success: true,
          ...labelResult
        });
      } catch (err) {
        console.error('📦 Label generation failed:', err.message);
        return res.status(200).json({
          success: false,
          labelFailed: true,
          labelError: err.message
        });
      }
    }

    // SHIPPO TRACKING WEBHOOK — auto-updates transaction shipping/payout status
    // Register at: portal.goshippo.com/api-config/webhooks → track_updated event
    if (action === 'shippo-webhook' && req.method === 'POST') {
      const { event, data } = req.body || {};

      // Shippo sends track_updated events with tracking data
      if (event !== 'track_updated' || !data) {
        return res.status(200).json({ ok: true });
      }

      const trackingNumber = data.tracking_number;
      const status = data.tracking_status?.status;

      if (!trackingNumber || !status) {
        return res.status(200).json({ ok: true });
      }

      // Find transaction by tracking number
      const { data: tx } = await supabase
        .from('transactions')
        .select('id, payout_status')
        .eq('tracking_number', trackingNumber)
        .maybeSingle();

      if (!tx) {
        console.log(`📦 Shippo webhook: unknown tracking ${trackingNumber}`);
        return res.status(200).json({ ok: true });
      }

      // Don't update if already paid
      if (tx.payout_status === 'paid') {
        return res.status(200).json({ ok: true });
      }

      // Map Shippo tracking status → our status
      // Shippo statuses: PRE_TRANSIT, TRANSIT, DELIVERED, RETURNED, FAILURE, UNKNOWN
      const updates = {};
      switch (status) {
        case 'PRE_TRANSIT':
          updates.shipping_status = 'label_created';
          break;
        case 'TRANSIT':
          updates.shipping_status = 'shipped';
          updates.payout_status = 'in_transit';
          break;
        case 'DELIVERED':
          updates.shipping_status = 'delivered';
          updates.payout_status = 'delivered';
          updates.delivered_at = new Date().toISOString();
          updates.contest_window_ends = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'FAILURE':
          updates.shipping_status = 'failed';
          break;
        case 'RETURNED':
          updates.shipping_status = 'returned';
          break;
        default:
          return res.status(200).json({ ok: true });
      }

      await supabase.from('transactions').update(updates).eq('id', tx.id);
      console.log(`📦 Shippo tracking update: ${trackingNumber} → ${status}`);

      return res.status(200).json({ ok: true });
    }

    // GET TRANSACTIONS for seller
    if (action === 'transactions' && req.method === 'GET') {
      const email = req.query.email?.toLowerCase();

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const { data: seller } = await supabase
        .from('sellers')
        .select('id')
        .eq('email', email)
        .single();

      if (!seller) {
        return res.status(200).json({ success: true, transactions: [], balance: 0 });
      }

      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('seller_id', seller.id)
        .order('created_at', { ascending: false });

      const pendingPayout = (transactions || [])
        .filter(t => t.status === 'pending_payout')
        .reduce((sum, t) => sum + (t.seller_payout || 0), 0);

      const totalEarnings = (transactions || [])
        .filter(t => t.status === 'paid')
        .reduce((sum, t) => sum + (t.seller_payout || 0), 0);

      return res.status(200).json({
        success: true,
        transactions: transactions || [],
        balance: {
          pending: pendingPayout,
          paid: totalEarnings,
          total: pendingPayout + totalEarnings
        }
      });
    }

    // CREATE SELLER (admin)
    if (action === 'create-seller' && req.method === 'POST') {
      const { name, email, phone, commission_rate, paypal_email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Check if seller already exists
      const { data: existing } = await supabase
        .from('sellers')
        .select('id')
        .ilike('email', email.toLowerCase())
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: 'Seller with this email already exists' });
      }

      // Generate unique placeholder phone if not provided
      let finalPhone = phone;
      if (!finalPhone) {
        const hash = email.toLowerCase().split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
        finalPhone = `NOPHONE-${Math.abs(hash).toString(16).padStart(8, '0')}`;
      }

      const newSeller = {
        email: email.toLowerCase(),
        phone: finalPhone,
        name: name || email.split('@')[0],
        commission_rate: commission_rate || 18,
        paypal_email: paypal_email || null,
        shopify_product_ids: []
      };

      const { data, error } = await supabase
        .from('sellers')
        .insert(newSeller)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ success: true, seller: data });
    }

    // UPDATE SELLER (admin)
    if (action === 'update-seller' && req.method === 'POST') {
      const { sellerId, name, email, phone, commission_rate, paypal_email } = req.body;

      if (!sellerId) {
        return res.status(400).json({ error: 'Seller ID required' });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email.toLowerCase();
      if (phone !== undefined) updates.phone = phone;
      if (commission_rate !== undefined) updates.commission_rate = commission_rate;
      if (paypal_email !== undefined) updates.paypal_email = paypal_email;

      const { data, error } = await supabase
        .from('sellers')
        .update(updates)
        .eq('id', sellerId)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ success: true, seller: data });
    }

    // TRANSFER LISTING to different seller (updates Shopify metafields)
    if (action === 'transfer-listing' && req.method === 'POST') {
      const { productId, fromSellerId, toSellerId } = req.body;

      if (!productId || !toSellerId) {
        return res.status(400).json({ error: 'Product ID and target seller ID required' });
      }

      // Get target seller
      const { data: toSeller } = await supabase
        .from('sellers')
        .select('*')
        .eq('id', toSellerId)
        .single();

      if (!toSeller) {
        return res.status(404).json({ error: 'Target seller not found' });
      }

      // Update Shopify metafields
      const metafields = await fetchMetafields(productId);

      await upsertMetafield(productId, metafields, 'seller', 'email', toSeller.email, 'single_line_text_field');
      await upsertMetafield(productId, metafields, 'seller', 'id', toSeller.id, 'single_line_text_field');
      if (toSeller.phone) {
        await upsertMetafield(productId, metafields, 'seller', 'phone', toSeller.phone, 'single_line_text_field');
      }

      // Get product title for email notifications
      let productTitle = 'your listing';
      try {
        const product = await getProduct(productId);
        productTitle = product?.title || productTitle;
      } catch (e) {
        console.error('Failed to fetch product for transfer email:', e.message);
      }

      // Remove from old seller's product list
      let fromSeller = null;
      if (fromSellerId) {
        const { data: fs } = await supabase
          .from('sellers')
          .select('id, name, email, phone, shopify_product_ids')
          .eq('id', fromSellerId)
          .single();
        fromSeller = fs;

        if (fromSeller) {
          const oldIds = (fromSeller.shopify_product_ids || []).filter(
            id => id.toString() !== productId.toString()
          );
          await supabase
            .from('sellers')
            .update({ shopify_product_ids: oldIds })
            .eq('id', fromSellerId);
        }
      }

      // Add to new seller's product list
      const newIds = [...new Set([...(toSeller.shopify_product_ids || []), productId.toString()])];
      await supabase
        .from('sellers')
        .update({ shopify_product_ids: newIds })
        .eq('id', toSellerId);

      // Send email notifications (non-fatal)
      try {
        if (fromSeller?.email) {
          await sendTransferFromNotification(fromSeller.email, fromSeller.name, productTitle, toSeller.name || toSeller.email);
        }
        if (toSeller.email) {
          await sendTransferToNotification(toSeller.email, toSeller.name, productTitle);
        }
      } catch (emailErr) {
        console.error('Transfer email error (non-fatal):', emailErr);
      }

      return res.status(200).json({
        success: true,
        message: `Listing transferred to ${toSeller.name || toSeller.email}`,
        newSeller: { id: toSeller.id, name: toSeller.name, email: toSeller.email }
      });
    }

    // DELIST LISTING (archive product, add delisted tag, append DELISTED to title)
    if (action === 'delist' && req.method === 'POST') {
      const { email, productId } = req.body;

      if (!email || !productId) {
        return res.status(400).json({ error: 'Email and product ID required' });
      }

      // Verify seller owns this product
      const { data: seller } = await supabase
        .from('sellers')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      const productIds = seller.shopify_product_ids || [];
      if (!productIds.includes(productId.toString()) && !productIds.includes(productId)) {
        return res.status(403).json({ error: 'Not authorized to modify this listing' });
      }

      const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
      const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

      // Get current product to preserve existing tags
      const getRes = await fetch(
        `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}.json`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      );
      const { product: currentProduct } = await getRes.json();
      const currentTags = currentProduct?.tags || '';

      // Add 'delisted' tag if not already present
      const tagsArray = currentTags.split(',').map(t => t.trim()).filter(Boolean);
      if (!tagsArray.includes('delisted')) {
        tagsArray.push('delisted');
      }

      // Remove pending-approval tag if present (it's being delisted, not pending)
      const cleanedTags = tagsArray.filter(t => t !== 'pending-approval');

      // Append DELISTED to title if not already there
      const currentTitle = currentProduct?.title || '';
      const delistedTitle = currentTitle.includes('DELISTED') ? currentTitle : `${currentTitle} DELISTED`;

      // Update product: status to archived + add delisted tag + update title
      const updateRes = await fetch(
        `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}.json`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN
          },
          body: JSON.stringify({
            product: {
              id: productId,
              title: delistedTitle,
              status: 'archived',
              tags: cleanedTags.join(', ')
            }
          })
        }
      );

      if (!updateRes.ok) {
        const errData = await updateRes.json();
        return res.status(400).json({ error: errData.errors || 'Failed to delist' });
      }

      return res.status(200).json({
        success: true,
        message: 'Listing delisted and archived',
        status: 'archived',
        isDelisted: true
      });
    }

    // RELIST LISTING (back to draft for re-approval, removes delisted tag + DELISTED from title)
    if (action === 'relist' && req.method === 'POST') {
      const { email, productId } = req.body;

      if (!email || !productId) {
        return res.status(400).json({ error: 'Email and product ID required' });
      }

      // Verify seller owns this product
      const { data: seller } = await supabase
        .from('sellers')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (!seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      const productIds = seller.shopify_product_ids || [];
      if (!productIds.includes(productId.toString()) && !productIds.includes(productId)) {
        return res.status(403).json({ error: 'Not authorized to modify this listing' });
      }

      const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
      const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

      // Get current product to update tags
      const getRes = await fetch(
        `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}.json`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      );
      const { product: currentProduct } = await getRes.json();
      const currentTags = currentProduct?.tags || '';

      // Remove 'delisted' tag, add 'pending-approval' so it shows up for admin review
      const tagsArray = currentTags.split(',').map(t => t.trim()).filter(t => t && t !== 'delisted');
      if (!tagsArray.includes('pending-approval')) {
        tagsArray.push('pending-approval');
      }

      // Remove DELISTED from title
      const currentTitle = currentProduct?.title || '';
      const cleanTitle = currentTitle.replace(/\s*DELISTED\s*/, '').trim();

      // Update product: status to draft (pending review) + remove delisted tag + add pending-approval + restore title
      const updateRes = await fetch(
        `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}.json`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN
          },
          body: JSON.stringify({
            product: {
              id: productId,
              title: cleanTitle,
              status: 'draft',
              tags: tagsArray.join(', ')
            }
          })
        }
      );

      if (!updateRes.ok) {
        const errData = await updateRes.json();
        return res.status(400).json({ error: errData.errors || 'Failed to relist' });
      }

      return res.status(200).json({
        success: true,
        message: 'Listing submitted for review',
        status: 'draft',
        isDelisted: false
      });
    }

    // SEARCH SELLERS (for transfer dropdown)
    if (action === 'search-sellers' && req.method === 'GET') {
      const query = req.query.q?.toLowerCase() || '';

      let dbQuery = supabase
        .from('sellers')
        .select('id, name, email, phone')
        .order('name', { ascending: true })
        .limit(20);

      if (query) {
        dbQuery = dbQuery.or(`name.ilike.%${query}%,email.ilike.%${query}%`);
      }

      const { data, error } = await dbQuery;

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ success: true, sellers: data || [] });
    }

    // GET MESSAGES for seller (admin)
    if (action === 'messages' && req.method === 'GET') {
      const { sellerId } = req.query;

      if (!sellerId) {
        return res.status(400).json({ error: 'Seller ID required' });
      }

      const messages = await getSellerMessages(sellerId, 100);

      return res.status(200).json({
        success: true,
        messages
      });
    }

    // TEST SHIPPING - Test Shippo/EasyPost/Easyship integration
    if (action === 'test-shipping') {
      const { getShippingLabel } = await import('../lib/shipping.js');

      // Test addresses
      const testSeller = {
        name: 'Test Seller',
        address_line1: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        phone: '5551234567'
      };

      const testBuyer = {
        name: 'Test Buyer',
        street1: '456 Oak Ave',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        country: 'US',
        phone: '5559876543'
      };

      try {
        console.log('🧪 Testing shipping label generation...');
        console.log('   Shippo key:', process.env.SHIPPO_API_KEY ? 'Set' : 'Not set');
        console.log('   EasyPost key:', process.env.EASYPOST_API_KEY ? 'Set' : 'Not set');
        console.log('   Easyship key:', process.env.EASYSHIP_API_KEY ? 'Set' : 'Not set');

        const result = await getShippingLabel(testSeller, 'Test Product - Blue Dress', testBuyer);

        const provider = process.env.SHIPPO_API_KEY ? 'Shippo' : process.env.EASYPOST_API_KEY ? 'EasyPost' : process.env.EASYSHIP_API_KEY ? 'Easyship' : 'Manual';
        return res.status(200).json({
          success: true,
          message: 'Shipping test completed',
          result,
          provider
        });
      } catch (err) {
        const provider = process.env.SHIPPO_API_KEY ? 'Shippo' : process.env.EASYPOST_API_KEY ? 'EasyPost' : process.env.EASYSHIP_API_KEY ? 'Easyship' : 'Manual';
        return res.status(500).json({
          success: false,
          error: err.message,
          provider
        });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Seller API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Send sale notification to seller via WhatsApp and email
async function notifySellerOfSale(seller, saleInfo) {
  const { productTitle, salePrice, sellerPayout } = saleInfo;
  const metadata = { productTitle, salePrice, payout: sellerPayout };

  // Send WhatsApp
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

  // Send email
  if (seller.email) {
    const { subject, html } = itemSoldInlineEmail(seller.name, productTitle, salePrice, sellerPayout);
    await sendEmail({
      sellerId: seller.id,
      to: seller.email,
      subject,
      html,
      context: 'item_sold',
      metadata
    });
  }
}

// Send shipping label to seller via WhatsApp and email
async function sendShippingLabel(seller, labelResult, productTitle) {
  const metadata = { productTitle, trackingNumber: labelResult.trackingNumber, carrier: labelResult.carrier };

  // Send WhatsApp
  if (seller.phone) {
    await sendWhatsApp({
      sellerId: seller.id,
      to: seller.phone,
      template: 'shipping_label',
      params: [productTitle, labelResult.trackingNumber, `${labelResult.carrier} ${labelResult.service}`, labelResult.labelUrl],
      context: 'shipping_label',
      metadata,
      textPreview: `📦 Shipping label ready for "${productTitle}". Tracking: ${labelResult.trackingNumber}`
    });
  }

  // Send email
  if (seller.email) {
    const { subject, html } = shippingLabelEmail(seller.name, productTitle, labelResult);
    await sendEmail({
      sellerId: seller.id,
      to: seller.email,
      subject,
      html,
      context: 'shipping_label',
      metadata
    });
  }
}
