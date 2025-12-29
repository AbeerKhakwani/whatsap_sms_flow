// api/seller/update-listing.js
// Update a seller's listing in Shopify

import { getSellerFromToken } from '../../lib/auth.js';
import { updateProduct, getProduct } from '../../lib/shopify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT' && req.method !== 'POST') {
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

    const { productId, title, price, description } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    // Verify seller owns this product
    const productIds = seller.shopify_product_ids || [];
    if (!productIds.includes(productId.toString()) && !productIds.includes(productId)) {
      return res.status(403).json({ error: 'Not authorized to edit this listing' });
    }

    // Build updates object
    const updates = {};
    if (title) updates.title = title;
    if (description) updates.body_html = description;

    // Update variant price if provided
    if (price !== undefined) {
      const product = await getProduct(productId);
      const variantId = product.variants?.[0]?.id;
      if (variantId) {
        // Update variant separately
        const shopifyUrl = process.env.VITE_SHOPIFY_STORE_URL;
        const shopifyToken = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

        await fetch(
          `https://${shopifyUrl}/admin/api/2024-10/variants/${variantId}.json`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopifyToken
            },
            body: JSON.stringify({
              variant: { id: variantId, price: price.toString() }
            })
          }
        );
      }
    }

    // Update product if there are updates
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

  } catch (error) {
    console.error('Update listing error:', error);
    return res.status(500).json({ error: error.message });
  }
}
