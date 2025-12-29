// api/auth/google.js
// Handle Google Sign-In (verify Google ID token and return JWT)

import { findOrCreateSellerFromGoogle, generateToken } from '../../lib/auth.js';

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

  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential' });
    }

    // Verify the Google ID token
    // The credential is a JWT from Google - decode and verify it
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    );

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const payload = await response.json();

    // Verify the token is for our app
    if (payload.aud !== googleClientId) {
      return res.status(401).json({ error: 'Token not for this app' });
    }

    // Find or create seller
    const seller = await findOrCreateSellerFromGoogle({
      email: payload.email,
      name: payload.name,
      googleId: payload.sub
    });

    // Generate our JWT token
    const token = generateToken(seller);

    return res.status(200).json({
      success: true,
      token,
      seller: {
        id: seller.id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: error.message });
  }
}
