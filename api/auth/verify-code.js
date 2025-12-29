// api/auth/verify-code.js
// Verify magic code and return JWT token

import { verifyCode, generateToken } from '../../lib/auth.js';

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
    const { email, phone, code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Please provide verification code' });
    }

    if (!email && !phone) {
      return res.status(400).json({ error: 'Please provide email or phone' });
    }

    const identifier = email || phone;
    const result = await verifyCode(identifier, code);

    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    // Generate JWT token
    const token = generateToken(result.seller);

    return res.status(200).json({
      success: true,
      token,
      seller: {
        id: result.seller.id,
        name: result.seller.name,
        email: result.seller.email,
        phone: result.seller.phone
      }
    });

  } catch (error) {
    console.error('Verify code error:', error);
    return res.status(500).json({ error: error.message });
  }
}
