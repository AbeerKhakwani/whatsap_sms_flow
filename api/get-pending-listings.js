// api/get-pending-listings.js
// Fetch draft products from Shopify with pending-approval tag

import { getPendingDrafts, getProductCounts } from '../lib/shopify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const products = await getPendingDrafts();
    const counts = await getProductCounts();

    // Transform to simpler format for dashboard
    const listings = products.map(product => {
      const variant = product.variants?.[0] || {};
      const tags = product.tags?.split(', ') || [];

      return {
        id: product.id,
        shopify_product_id: product.id,
        product_name: product.title,
        designer: product.vendor || 'Unknown Designer',
        size: variant.option1 || 'One Size',
        condition: variant.option3 || 'Good',
        asking_price_usd: parseFloat(variant.price) || 0,
        description: product.body_html?.replace(/<[^>]*>/g, ' ').trim() || '',
        images: product.images?.map(img => img.src) || [],
        created_at: product.created_at,
        shopify_admin_url: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`,
        tags
      };
    });

    return res.status(200).json({
      success: true,
      listings,
      stats: {
        pending: listings.length,
        approved: counts.active || 0,
        sold: 0
      }
    });

  } catch (error) {
    console.error('Error fetching pending listings:', error);
    return res.status(500).json({ error: error.message });
  }
}
