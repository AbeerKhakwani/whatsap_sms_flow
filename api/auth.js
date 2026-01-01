// api/auth.js
// Auth endpoint - handles session validation and seller lookup

import { getSellerFromToken } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body;

  try {
    // SESSION - Get/create seller from Supabase access token (after OAuth)
    if (action === 'session') {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ error: 'Missing access token' });
      }

      const { seller, error } = await getSellerFromToken(accessToken);

      if (error || !seller) {
        return res.status(401).json({ error: error || 'Could not get seller' });
      }

      return res.status(200).json({
        success: true,
        seller: {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: error.message });
  }
}
