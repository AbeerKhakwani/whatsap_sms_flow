// api/auth.js
// Consolidated auth endpoints: send-code, verify-code, google

import {
  generateCode,
  storeVerificationCode,
  sendEmailCode,
  sendSMSCode,
  verifyCode,
  generateToken,
  findOrCreateSellerFromGoogle
} from '../lib/auth.js';

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
    // SEND CODE
    if (action === 'send-code') {
      const { email, phone } = req.body;
      if (!email && !phone) {
        return res.status(400).json({ error: 'Please provide email or phone' });
      }

      const identifier = email || phone;
      const code = generateCode();
      await storeVerificationCode(identifier, code);

      if (email) {
        await sendEmailCode(email, code);
      } else {
        await sendSMSCode(phone, code);
      }

      return res.status(200).json({
        success: true,
        message: `Code sent to ${email ? 'email' : 'phone'}`,
        ...(process.env.NODE_ENV === 'development' && { code })
      });
    }

    // VERIFY CODE
    if (action === 'verify-code') {
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
    }

    // GOOGLE SSO
    if (action === 'google') {
      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({ error: 'Missing Google credential' });
      }

      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
      );

      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }

      const payload = await response.json();
      if (payload.aud !== googleClientId) {
        return res.status(401).json({ error: 'Token not for this app' });
      }

      const seller = await findOrCreateSellerFromGoogle({
        email: payload.email,
        name: payload.name,
        googleId: payload.sub
      });

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
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: error.message });
  }
}
