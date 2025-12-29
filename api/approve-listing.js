// api/approve-listing.js
// Approve a listing - change Shopify status from draft to active

import { approveDraft } from '../lib/shopify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { shopifyProductId } = req.body;

    if (!shopifyProductId) {
      return res.status(400).json({ error: 'Please provide shopifyProductId' });
    }

    const product = await approveDraft(shopifyProductId);

    return res.status(200).json({
      success: true,
      productId: product.id,
      shopifyUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`
    });

  } catch (error) {
    console.error('Approve error:', error);
    return res.status(500).json({ error: error.message });
  }
}
