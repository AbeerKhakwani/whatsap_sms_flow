// api/seller.js
// Consolidated seller endpoints: me, listings, update-listing

import { getSellerFromToken } from '../lib/auth.js';
import { getProduct, updateProduct } from '../lib/shopify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const { seller, error: authError } = await getSellerFromToken(token);

  if (authError || !seller) {
    return res.status(401).json({ error: authError || 'Invalid token' });
  }

  const { action } = req.query;

  try {
    // GET SELLER INFO
    if (action === 'me' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        seller: {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone,
          shopify_product_ids: seller.shopify_product_ids || [],
          created_at: seller.created_at
        }
      });
    }

    // GET LISTINGS
    if (action === 'listings' && req.method === 'GET') {
      const productIds = seller.shopify_product_ids || [];

      if (productIds.length === 0) {
        return res.status(200).json({
          success: true,
          listings: [],
          stats: { total: 0, draft: 0, active: 0, sold: 0 }
        });
      }

      const listings = [];
      let stats = { total: 0, draft: 0, active: 0, sold: 0 };

      for (const productId of productIds) {
        try {
          const product = await getProduct(productId);
          const variant = product.variants?.[0] || {};

          listings.push({
            id: product.id,
            title: product.title,
            designer: product.vendor || 'Unknown',
            status: product.status,
            price: parseFloat(variant.price) || 0,
            size: variant.option1 || 'One Size',
            condition: variant.option3 || 'Good',
            image: product.images?.[0]?.src || null,
            images: product.images?.map(img => img.src) || [],
            description: product.body_html?.replace(/<[^>]*>/g, ' ').trim() || '',
            tags: product.tags?.split(', ') || [],
            created_at: product.created_at,
            updated_at: product.updated_at,
            shopify_url: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`
          });
          stats.total++;

          if (product.status === 'draft') stats.draft++;
          else if (product.status === 'active') stats.active++;
          else if (product.status === 'archived') stats.sold++;
        } catch (err) {
          console.log(`Product ${productId} not found:`, err.message);
        }
      }

      listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return res.status(200).json({ success: true, listings, stats });
    }

    // UPDATE LISTING
    if (action === 'update' && (req.method === 'PUT' || req.method === 'POST')) {
      const { productId, title, price, description } = req.body;

      if (!productId) {
        return res.status(400).json({ error: 'Product ID required' });
      }

      const productIds = seller.shopify_product_ids || [];
      if (!productIds.includes(productId.toString()) && !productIds.includes(productId)) {
        return res.status(403).json({ error: 'Not authorized to edit this listing' });
      }

      const updates = {};
      if (title) updates.title = title;
      if (description) updates.body_html = description;

      if (price !== undefined) {
        const product = await getProduct(productId);
        const variantId = product.variants?.[0]?.id;
        if (variantId) {
          await fetch(
            `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/variants/${variantId}.json`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
              },
              body: JSON.stringify({
                variant: { id: variantId, price: price.toString() }
              })
            }
          );
        }
      }

      let product;
      if (Object.keys(updates).length > 0) {
        product = await updateProduct(productId, updates);
      } else {
        product = await getProduct(productId);
      }

      return res.status(200).json({
        success: true,
        listing: {
          id: product.id,
          title: product.title,
          price: product.variants?.[0]?.price,
          status: product.status
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Seller API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
