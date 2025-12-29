// api/seller/me.js
// Get current seller info from token

import { getSellerFromToken } from '../../lib/auth.js';

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

  } catch (error) {
    console.error('Get seller error:', error);
    return res.status(500).json({ error: error.message });
  }
}
