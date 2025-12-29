// api/seller/listings.js
// Get seller's listings from Shopify

import { getSellerFromToken } from '../../lib/auth.js';
import { getProduct } from '../../lib/shopify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { seller, error } = await getSellerFromToken(token);

    if (error || !seller) {
      return res.status(401).json({ error: error || 'Invalid token' });
    }

    const productIds = seller.shopify_product_ids || [];

    if (productIds.length === 0) {
      return res.status(200).json({
        success: true,
        listings: [],
        stats: { total: 0, draft: 0, active: 0, sold: 0 }
      });
    }

    // Fetch each product from Shopify
    const listings = [];
    let stats = { total: 0, draft: 0, active: 0, sold: 0 };

    for (const productId of productIds) {
      try {
        const product = await getProduct(productId);
        const variant = product.variants?.[0] || {};

        const listing = {
          id: product.id,
          title: product.title,
          designer: product.vendor || 'Unknown',
          status: product.status, // draft, active, archived
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
        };

        listings.push(listing);
        stats.total++;

        if (product.status === 'draft') stats.draft++;
        else if (product.status === 'active') stats.active++;
        else if (product.status === 'archived') stats.sold++; // Treat archived as sold for now

      } catch (err) {
        console.log(`Product ${productId} not found or error:`, err.message);
        // Product might have been deleted
      }
    }

    // Sort by created_at descending
    listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({
      success: true,
      listings,
      stats
    });

  } catch (error) {
    console.error('Get listings error:', error);
    return res.status(500).json({ error: error.message });
  }
}
