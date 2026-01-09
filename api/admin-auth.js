// api/admin-auth.js
// Admin authentication with email verification code

import {
  generateCode,
  storeVerificationCode,
  verifyCode,
  generateAdminToken,
  verifyToken,
  isAdminEmail
} from '../lib/auth-utils.js';
import { sendVerificationCode } from '../lib/email.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body;

  try {
    // SEND-CODE - Send verification code to admin email
    if (action === 'send-code') {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      // Check if email is in admin list
      if (!isAdminEmail(email)) {
        return res.status(401).json({ error: 'Not authorized' });
      }

      const code = generateCode();

      // Store code
      const stored = await storeVerificationCode(email, code, 'email');
      if (!stored) {
        return res.status(500).json({ error: 'Failed to generate code' });
      }

      // Send code via email
      const sent = await sendVerificationCode(email, code);
      if (!sent?.success) {
        console.error('Email send failed:', sent?.error);
        return res.status(500).json({ error: 'Failed to send email' });
      }

      return res.status(200).json({
        success: true,
        message: 'Code sent to your email'
      });
    }

    // VERIFY-CODE - Verify code and return token
    if (action === 'verify-code') {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code required' });
      }

      // Check if email is in admin list
      if (!isAdminEmail(email)) {
        return res.status(401).json({ error: 'Not authorized' });
      }

      // Verify the code
      const result = await verifyCode(email, code);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }

      // Generate token
      const token = generateAdminToken(email);

      return res.status(200).json({
        success: true,
        token,
        admin: { email }
      });
    }

    // VERIFY - Check if token is valid
    if (action === 'verify') {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '') || req.body.token;

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const decoded = verifyToken(token);
      if (!decoded || decoded.type !== 'admin') {
        return res.status(401).json({ error: 'Invalid token' });
      }

      return res.status(200).json({
        success: true,
        admin: {
          email: decoded.email
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: error.message });
  }
}
