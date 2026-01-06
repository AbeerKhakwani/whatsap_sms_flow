// api/seller.js
// Seller endpoints - no auth for now, just email-based lookup

import { createClient } from '@supabase/supabase-js';
import { getProduct, updateProduct } from '../lib/shopify.js';
import { validateUpdate } from '../lib/security.js';

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

      for (const productId of productIds) {
        try {
          const product = await getProduct(productId);
          const variant = product.variants?.[0] || {};

          // Fetch metafields for pricing info
          let commissionRate = 18;
          let sellerAskingPrice = null;
          let sellerPayout = null;

          try {
            const metafieldsRes = await fetch(
              `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
              { headers: { 'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN } }
            );
            const { metafields } = await metafieldsRes.json();

            for (const mf of metafields || []) {
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
          } catch (e) {
            console.log('Could not fetch metafields:', e.message);
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
            shopify_url: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`,
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
        } catch (err) {
          console.log(`Product ${productId} not found:`, err.message);
        }
      }

      listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Calculate earnings from historical sold products
      const totalEarnings = soldProducts.reduce((sum, p) => sum + (p.sellerEarnings || 0), 0);
      const pendingPayout = historicalProducts
        .filter(p => p.status === 'SOLD_WITHOUT_PAYOUT')
        .reduce((sum, p) => sum + (p.sellerEarnings || 0), 0);

      return res.status(200).json({
        success: true,
        listings,
        stats: {
          ...stats,
          sold: soldProducts.length,
          inStock: historicalProducts.filter(p => p.status === 'IN_STOCK').length
        },
        seller: {
          name: seller.name,
          email: seller.email,
          commissionRate: seller.commission_rate || 50,
          totalEarnings: seller.total_earnings || totalEarnings,
          pendingPayout: seller.pending_payout || pendingPayout
        },
        soldProducts: soldProducts.map(p => ({
          title: p.title,
          retailPrice: p.retailPrice,
          splitPercent: p.splitPercent,
          earnings: p.sellerEarnings,
          dateSold: p.dateSold,
          status: p.status,
          brand: p.brand
        }))
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
      }

      let updatedProduct;
      if (Object.keys(updates).length > 0) {
        updatedProduct = await updateProduct(productId, updates);
      } else {
        updatedProduct = await getProduct(productId);
      }

      return res.status(200).json({
        success: true,
        listing: {
          id: updatedProduct.id,
          title: updatedProduct.title,
          price: updatedProduct.variants?.[0]?.price,
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

      // Delete all conversations for this seller
      const { error: convError } = await supabase
        .from('sms_conversations')
        .delete()
        .eq('seller_id', sellerId);

      if (convError) {
        console.error('Delete conversations error:', convError);
        errors.push(`conversations: ${convError.message}`);
      }

      // Clear phone from seller so findSellerByPhone won't find them
      // Use empty string if null doesn't work
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
      const ids = req.query.ids?.split(',').filter(Boolean);

      if (!ids || ids.length === 0) {
        return res.status(400).json({ error: 'Product IDs required' });
      }

      const products = [];
      for (const productId of ids.slice(0, 20)) { // Limit to 20
        try {
          const product = await getProduct(productId);
          const variant = product.variants?.[0] || {};

          const inventory = variant.inventory_quantity ?? 0;
          const isSold = inventory === 0 && product.status === 'active';

          // Fetch metafields for pricing info
          let commissionRate = 18;
          let sellerAskingPrice = null;
          let sellerPayout = null;

          try {
            const metafieldsRes = await fetch(
              `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
              { headers: { 'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN } }
            );
            const { metafields } = await metafieldsRes.json();

            for (const mf of metafields || []) {
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
          } catch (e) {
            console.log('Could not fetch metafields:', e.message);
          }

          // Fallback calculation if metafields not set
          const price = parseFloat(variant.price) || 0;
          if (sellerAskingPrice === null) {
            sellerAskingPrice = Math.max(0, price - 10); // Remove $10 fee
          }
          if (sellerPayout === null) {
            sellerPayout = sellerAskingPrice * ((100 - commissionRate) / 100);
          }

          products.push({
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
          });
        } catch (err) {
          console.log(`Product ${productId} not found:`, err.message);
        }
      }

      return res.status(200).json({ success: true, products });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Seller API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
