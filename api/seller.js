// api/seller.js
// Seller endpoints - no auth for now, just email-based lookup
// Also handles Shopify order webhooks

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getProduct, updateProduct } from '../lib/shopify.js';
import { validateUpdate } from '../lib/security.js';
import { getShippingLabel, getShippingInstructions, WAREHOUSE_ADDRESS } from '../lib/shipping.js';
import { logMessage, getSellerMessages } from '../lib/messages.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      const metafieldPromises = (products || []).map(async (product) => {
        try {
          const res = await fetch(
            `https://${SHOPIFY_URL}/admin/api/2024-10/products/${product.id}/metafields.json`,
            { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
          );
          const { metafields } = await res.json();
          return { productId: product.id, metafields: metafields || [] };
        } catch (e) {
          return { productId: product.id, metafields: [] };
        }
      });

      const allMetafields = await Promise.all(metafieldPromises);
      const metafieldsByProduct = {};
      for (const { productId, metafields } of allMetafields) {
        metafieldsByProduct[productId] = metafields;
      }

      // Process all products
      for (const product of products || []) {
        const variant = product.variants?.[0] || {};
        const metafields = metafieldsByProduct[product.id] || [];

        // Extract pricing from metafields
        let commissionRate = 18;
        let sellerAskingPrice = null;
        let sellerPayout = null;

        for (const mf of metafields) {
          if (mf.namespace === 'pricing' && mf.key === 'commission_rate') {
            commissionRate = parseFloat(mf.value) || 18;
          }
          if (mf.namespace === 'pricing' && mf.key === 'seller_asking_price') {
            sellerAskingPrice = parseFloat(mf.value) || null;
          }
          if (mf.namespace === 'pricing' && mf.key === 'seller_payout') {
            sellerPayout = parseFloat(mf.value) || null;
          }
        }

        // Fallback calculation if metafields not set
        const price = parseFloat(variant.price) || 0;
        if (sellerAskingPrice === null) {
          sellerAskingPrice = Math.max(0, price - 10);
        }
        if (sellerPayout === null) {
          sellerPayout = sellerAskingPrice * ((100 - commissionRate) / 100);
        }

        // Check if sold (0 inventory or archived)
        const inventory = variant.inventory_quantity ?? 0;
        const isSold = inventory === 0 || product.status === 'archived';

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
        shippingService: tx.shipping_service
      }));

      // Calculate earnings from transactions
      const totalEarnings = (transactions || [])
        .filter(tx => tx.status === 'paid')
        .reduce((sum, tx) => sum + (tx.seller_payout || 0), 0);

      const pendingPayout = (transactions || [])
        .filter(tx => tx.status === 'pending_payout')
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
        soldProducts: allSoldProducts
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
          // Update metafields
          const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
          const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

          // Get existing metafields to read product's commission rate
          const mfRes = await fetch(
            `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
            { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
          );
          const { metafields } = await mfRes.json();

          // Use product's commission rate, fallback to seller's default, then 18%
          const existingCommission = metafields?.find(m => m.namespace === 'pricing' && m.key === 'commission_rate')?.value;
          const commissionRate = parseFloat(existingCommission) || seller.commission_rate || 18;

          const newPrice = parseFloat(safeData.price);
          const askingPrice = Math.max(0, newPrice - 10); // Remove $10 fee
          const payout = askingPrice * (1 - commissionRate / 100);

          // Helper to update or create metafield
          async function setMetafield(namespace, key, value, type = 'number_decimal') {
            const existing = (metafields || []).find(m => m.namespace === namespace && m.key === key);
            if (existing) {
              await fetch(`https://${SHOPIFY_URL}/admin/api/2024-10/metafields/${existing.id}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
                body: JSON.stringify({ metafield: { id: existing.id, value: value.toString() } })
              });
            } else {
              await fetch(`https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
                body: JSON.stringify({ metafield: { namespace, key, value: value.toString(), type } })
              });
            }
          }

          await setMetafield('pricing', 'seller_asking_price', askingPrice.toFixed(2));
          await setMetafield('pricing', 'seller_payout', payout.toFixed(2));
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
      const finalMfRes = await fetch(
        `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
        { headers: { 'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN } }
      );
      const { metafields: finalMf } = await finalMfRes.json();
      const sellerAskingPrice = parseFloat(finalMf?.find(m => m.namespace === 'pricing' && m.key === 'seller_asking_price')?.value) || Math.max(0, finalPrice - 10);
      const sellerPayout = parseFloat(finalMf?.find(m => m.namespace === 'pricing' && m.key === 'seller_payout')?.value) || sellerAskingPrice * 0.82;

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

      const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
      const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

      // BATCH FETCH: Get all products in one API call
      const productsRes = await fetch(
        `https://${SHOPIFY_URL}/admin/api/2024-10/products.json?ids=${ids.join(',')}&limit=250`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      );
      const { products: shopifyProducts } = await productsRes.json();

      // PARALLEL FETCH: Get all metafields at once
      const metafieldPromises = (shopifyProducts || []).map(async (product) => {
        try {
          const res = await fetch(
            `https://${SHOPIFY_URL}/admin/api/2024-10/products/${product.id}/metafields.json`,
            { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
          );
          const { metafields } = await res.json();
          return { productId: product.id, metafields: metafields || [] };
        } catch (e) {
          return { productId: product.id, metafields: [] };
        }
      });

      const allMetafields = await Promise.all(metafieldPromises);
      const metafieldsByProduct = {};
      for (const { productId, metafields } of allMetafields) {
        metafieldsByProduct[productId] = metafields;
      }

      // Process all products
      const products = (shopifyProducts || []).map(product => {
        const variant = product.variants?.[0] || {};
        const metafields = metafieldsByProduct[product.id] || [];

        let commissionRate = 18;
        let sellerAskingPrice = null;
        let sellerPayout = null;

        for (const mf of metafields) {
          if (mf.namespace === 'pricing' && mf.key === 'commission_rate') {
            commissionRate = parseFloat(mf.value) || 18;
          }
          if (mf.namespace === 'pricing' && mf.key === 'seller_asking_price') {
            sellerAskingPrice = parseFloat(mf.value) || null;
          }
          if (mf.namespace === 'pricing' && mf.key === 'seller_payout') {
            sellerPayout = parseFloat(mf.value) || null;
          }
        }

        const price = parseFloat(variant.price) || 0;
        if (sellerAskingPrice === null) {
          sellerAskingPrice = Math.max(0, price - 10);
        }
        if (sellerPayout === null) {
          sellerPayout = sellerAskingPrice * ((100 - commissionRate) / 100);
        }

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
          // Get product with metafields
          const product = await getProduct(productId);

          // Fetch metafields separately
          let sellerEmail = null;
          let sellerId = null;
          let sellerPayout = null;
          let commissionRate = 18;

          try {
            const metafieldsRes = await fetch(
              `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
              { headers: { 'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN } }
            );
            const { metafields } = await metafieldsRes.json();

            for (const mf of metafields || []) {
              if (mf.namespace === 'seller' && mf.key === 'email') sellerEmail = mf.value;
              if (mf.namespace === 'seller' && mf.key === 'id') sellerId = mf.value;
              if (mf.namespace === 'pricing' && mf.key === 'seller_payout') sellerPayout = parseFloat(mf.value);
              if (mf.namespace === 'pricing' && mf.key === 'commission_rate') commissionRate = parseFloat(mf.value);
            }
          } catch (e) {
            console.log('Could not fetch metafields:', e.message);
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
          const transaction = {
            seller_id: seller.id,
            order_id: order.id.toString(),
            order_name: order.name,
            product_id: productId.toString(),
            product_title: item.title || product.title,
            sale_price: salePrice,
            seller_payout: sellerPayout,
            commission_rate: commissionRate,
            status: 'pending_payout',
            shipping_status: 'pending_label',
            customer_email: order.email,
            buyer_address: buyerAddress,
            created_at: new Date().toISOString()
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

          console.log(`   ✅ Created transaction for ${item.title} | Seller: ${seller.email} | Payout: $${sellerPayout}`);

          // Generate shipping label if seller has address
          let labelResult = null;
          if (seller.shipping_address) {
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

              labelResult = await getShippingLabel(sellerForShipping, item.title || product.title);

              if (labelResult.labelUrl) {
                // Update transaction with shipping info
                await supabase
                  .from('transactions')
                  .update({
                    shipping_label_url: labelResult.labelUrl,
                    tracking_number: labelResult.trackingNumber,
                    carrier: labelResult.carrier || 'USPS',
                    shipping_service: labelResult.service,
                    shipping_status: 'label_created'
                  })
                  .eq('id', newTx.id);

                console.log(`   📦 Generated shipping label: ${labelResult.trackingNumber}`);
              }
            } catch (labelErr) {
              console.log(`   ⚠️ Could not generate label: ${labelErr.message}`);
            }
          }

          // Send notifications to seller (include label if available)
          await notifySellerOfSale(seller, {
            productTitle: item.title || product.title,
            salePrice,
            sellerPayout,
            labelResult
          });

          results.push({ sellerId: seller.id, productId, payout: sellerPayout, hasLabel: !!labelResult?.labelUrl });

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
      const { email, productId, productTitle, transactionId } = req.body;

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

        const labelResult = await getShippingLabel(sellerForShipping, productTitle);

        // If we got a real label and have a transaction ID, update the transaction
        if (labelResult.labelUrl && transactionId) {
          await supabase
            .from('transactions')
            .update({
              shipping_label_url: labelResult.labelUrl,
              tracking_number: labelResult.trackingNumber,
              carrier: labelResult.carrier || 'USPS',
              shipping_service: labelResult.service,
              shipping_status: 'label_created'
            })
            .eq('id', transactionId)
            .eq('seller_id', seller.id);
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
        // Fall back to instructions if label generation fails
        return res.status(200).json({
          success: true,
          type: 'instructions',
          message: getShippingInstructions(seller, productTitle),
          warehouseAddress: WAREHOUSE_ADDRESS,
          error: err.message
        });
      }
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
      const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
      const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

      // Get existing metafields
      const metafieldsRes = await fetch(
        `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      );
      const { metafields } = await metafieldsRes.json();

      // Update or create seller metafields
      async function setMetafield(namespace, key, value, type = 'single_line_text_field') {
        const existing = (metafields || []).find(m => m.namespace === namespace && m.key === key);
        if (existing) {
          await fetch(`https://${SHOPIFY_URL}/admin/api/2024-10/metafields/${existing.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
            body: JSON.stringify({ metafield: { id: existing.id, value: value.toString() } })
          });
        } else {
          await fetch(`https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
            body: JSON.stringify({ metafield: { namespace, key, value: value.toString(), type } })
          });
        }
      }

      await setMetafield('seller', 'email', toSeller.email);
      await setMetafield('seller', 'id', toSeller.id);
      if (toSeller.phone) {
        await setMetafield('seller', 'phone', toSeller.phone);
      }

      // Remove from old seller's product list
      if (fromSellerId) {
        const { data: fromSeller } = await supabase
          .from('sellers')
          .select('shopify_product_ids')
          .eq('id', fromSellerId)
          .single();

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

      return res.status(200).json({
        success: true,
        message: `Listing transferred to ${toSeller.name || toSeller.email}`,
        newSeller: { id: toSeller.id, name: toSeller.name, email: toSeller.email }
      });
    }

    // DELIST LISTING (set to draft - hides from store, adds delisted tag)
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

      // Update product: status to draft + add delisted tag
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
              status: 'draft',
              tags: tagsArray.join(', ')
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
        message: 'Listing delisted (hidden from store)',
        status: 'draft',
        isDelisted: true
      });
    }

    // RELIST LISTING (set to active - shows on store, removes delisted tag)
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

      // Remove 'delisted' tag
      const tagsArray = currentTags.split(',').map(t => t.trim()).filter(t => t && t !== 'delisted');

      // Update product: status to draft (pending review) + remove delisted tag
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

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Seller API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Send sale notification to seller via WhatsApp and email
async function notifySellerOfSale(seller, saleInfo) {
  const { productTitle, salePrice, sellerPayout, labelResult } = saleInfo;
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const RESEND_KEY = process.env.RESEND_API_KEY;

  const waMessage = `🎉 Your item sold!\n\n` +
    `"${productTitle}" just sold for $${salePrice.toFixed(0)}!\n\n` +
    `💵 Your payout: $${sellerPayout.toFixed(0)}\n\n` +
    `We'll process your payment within 7 days.\n\n` +
    `View your dashboard: https://sell.thephirstory.com`;

  // Send WhatsApp
  if (seller.phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
    try {
      let phone = seller.phone.replace(/\D/g, '');
      if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;

      const waRes = await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        // Template: "Great news! 🎉 Your {{1}} just sold for ${{2}}! We'll send your earnings within 5 business days."
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: 'item_sold',
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: productTitle },
                  { type: 'text', text: salePrice.toFixed(0) }
                ]
              }
            ]
          }
        })
      });

      if (waRes.ok) {
        console.log(`   📱 WhatsApp sent to ${seller.phone}`);
        await logMessage({
          sellerId: seller.id,
          type: 'whatsapp',
          recipient: seller.phone,
          content: waMessage,
          context: 'item_sold',
          metadata: { productTitle, salePrice, payout: sellerPayout }
        });
      }
    } catch (err) {
      console.error(`   WhatsApp failed:`, err.message);
    }
  }

  // Send email
  if (seller.email && RESEND_KEY) {
    const emailSubject = `🎉 Your item sold! - ${productTitle}`;
    const emailContent = `${productTitle} sold for $${salePrice.toFixed(2)}. Your payout: $${sellerPayout.toFixed(2)}`;

    // Build shipping section if label is available
    const shippingSection = labelResult?.labelUrl ? `
      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h2 style="margin: 0 0 12px 0; color: #166534;">📦 Ship Your Item</h2>
        <p style="margin: 0 0 8px 0;">Your prepaid shipping label is ready!</p>
        <p style="margin: 0 0 8px 0;"><strong>Tracking:</strong> ${labelResult.trackingNumber}</p>
        <p style="margin: 0 0 16px 0;"><strong>Service:</strong> ${labelResult.carrier} ${labelResult.service}</p>
        <a href="${labelResult.labelUrl}" style="display: inline-block; background: #166534; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-right: 8px;">Print Label</a>
      </div>
      <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h3 style="margin: 0 0 8px 0; color: #854d0e;">📝 How to Ship</h3>
        <ol style="margin: 0; padding-left: 20px; color: #713f12;">
          <li>Print the shipping label above</li>
          <li>Pack your item securely in a box or padded envelope</li>
          <li>Attach the label to the outside of the package</li>
          <li>Drop off at any USPS location or schedule a pickup</li>
        </ol>
      </div>
    ` : `
      <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h3 style="margin: 0 0 8px 0; color: #9a3412;">📦 Next Step: Ship Your Item</h3>
        <p style="margin: 0; color: #c2410c;">Visit your dashboard to get your shipping label and instructions.</p>
      </div>
    `;

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'The Phir Story <noreply@send.thephirstory.com>',
          to: seller.email,
          subject: emailSubject,
          html: `
            <div style="font-family: sans-serif; max-width: 600px;">
              <h1 style="color: #16a34a;">🎉 Congratulations${seller.name ? `, ${seller.name}` : ''}!</h1>
              <p>Your item <strong>${productTitle}</strong> just sold for $${salePrice.toFixed(2)}!</p>
              <p style="font-size: 24px; color: #16a34a;"><strong>Your payout: $${sellerPayout.toFixed(2)}</strong></p>
              ${shippingSection}
              <p>We'll process your payment within 7 business days after we receive the item.</p>
              <a href="https://sell.thephirstory.com" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View Dashboard</a>
            </div>
          `
        })
      });

      if (emailRes.ok) {
        console.log(`   📧 Email sent to ${seller.email}`);
        await logMessage({
          sellerId: seller.id,
          type: 'email',
          recipient: seller.email,
          subject: emailSubject,
          content: emailContent,
          context: 'item_sold',
          metadata: { productTitle, salePrice, payout: sellerPayout }
        });
      }
    } catch (err) {
      console.error(`   Email failed:`, err.message);
    }
  }
}

// Send shipping label to seller via WhatsApp and email
async function sendShippingLabel(seller, labelResult, productTitle) {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const RESEND_KEY = process.env.RESEND_API_KEY;

  const waMessage = `📦 Shipping Label Ready!\n\n` +
    `For: "${productTitle}"\n\n` +
    `Tracking: ${labelResult.trackingNumber}\n` +
    `Carrier: ${labelResult.carrier} ${labelResult.service}\n` +
    `Est. Delivery: ${labelResult.estimatedDelivery}\n\n` +
    `Print your label:\n${labelResult.labelUrl}\n\n` +
    `Drop off at any USPS location or schedule pickup.`;

  // Send WhatsApp
  if (seller.phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
    try {
      let phone = seller.phone.replace(/\D/g, '');
      if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;

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
            name: 'shipping_label',
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: productTitle },
                  { type: 'text', text: labelResult.trackingNumber },
                  { type: 'text', text: `${labelResult.carrier} ${labelResult.service}` },
                  { type: 'text', text: labelResult.labelUrl }
                ]
              }
            ]
          }
        })
      });

      if (waRes.ok) {
        console.log(`   📱 Shipping label sent to ${seller.phone}`);
        await logMessage({
          sellerId: seller.id,
          type: 'whatsapp',
          recipient: seller.phone,
          content: waMessage,
          context: 'shipping_label',
          metadata: { productTitle, trackingNumber: labelResult.trackingNumber, carrier: labelResult.carrier }
        });
      }
    } catch (err) {
      console.error(`   WhatsApp shipping label failed:`, err.message);
    }
  }

  // Send email with label PDF
  if (seller.email && RESEND_KEY) {
    const emailSubject = `📦 Your Shipping Label - ${productTitle}`;
    const emailContent = `Shipping label for ${productTitle}. Tracking: ${labelResult.trackingNumber}. ${labelResult.carrier} ${labelResult.service}.`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'The Phir Story <noreply@send.thephirstory.com>',
          to: seller.email,
          subject: emailSubject,
          html: `
            <div style="font-family: sans-serif; max-width: 500px;">
              <h1 style="color: #2563eb;">📦 Your Shipping Label is Ready!</h1>
              <p>Here's your prepaid shipping label for <strong>${productTitle}</strong>.</p>

              <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Tracking:</strong> ${labelResult.trackingNumber}</p>
                <p style="margin: 4px 0;"><strong>Carrier:</strong> ${labelResult.carrier} ${labelResult.service}</p>
                <p style="margin: 4px 0;"><strong>Est. Delivery:</strong> ${labelResult.estimatedDelivery}</p>
              </div>

              <a href="${labelResult.labelUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 8px 0;">Print Shipping Label</a>

              <h3 style="margin-top: 24px;">Next Steps:</h3>
              <ol>
                <li>Print the label (or show QR code at USPS)</li>
                <li>Pack your item securely</li>
                <li>Drop off at any USPS location</li>
              </ol>

              <p style="color: #6b7280; font-size: 14px;">We'll notify you when your item arrives at our warehouse!</p>
            </div>
          `
        })
      });
      console.log(`   📧 Shipping label email sent to ${seller.email}`);

      // Log email message
      await logMessage({
        sellerId: seller.id,
        type: 'email',
        recipient: seller.email,
        subject: emailSubject,
        content: emailContent,
        context: 'shipping_label',
        metadata: { productTitle, trackingNumber: labelResult.trackingNumber, carrier: labelResult.carrier }
      });
    } catch (err) {
      console.error(`   Email shipping label failed:`, err.message);
    }
  }
}
