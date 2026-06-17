// api/admin-auth.js
// Admin authentication with email verification code

import jwt from 'jsonwebtoken';
import {
  generateCode,
  storeVerificationCode,
  verifyCode,
  generateAdminToken,
  verifyToken,
  isAdminEmail,
  verifyAdminByPassword,
  getAdminName
} from '../lib/auth-utils.js';
import { sendVerificationCode } from '../lib/email.js';
import { cors } from '../lib/cors.js';
import { supabase } from '../lib/supabase-admin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'phirstory-jwt-secret-change-in-production';

export default async function handler(req, res) {
  if (cors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body;

  try {
    // LOGIN - Password-only (credentials live in ADMIN_USERS). No email entered:
    // the password itself identifies the admin (Abeer vs Faqiha). The token carries
    // the display name so actions can be attributed ("by Faqiha") without a second
    // lookup. If ADMIN_USERS isn't configured, nothing matches and admins use the
    // email-code (Gmail) master login below.
    if (action === 'login') {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password required' });
      }

      const admin = verifyAdminByPassword(password);
      if (!admin) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      const token = generateAdminToken(admin.email, admin.name);
      return res.status(200).json({
        success: true,
        token,
        admin: { email: admin.email, name: admin.name }
      });
    }

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

      // Generate token (carry the display name for attribution, same as login)
      const name = getAdminName(email);
      const token = generateAdminToken(email, name);

      return res.status(200).json({
        success: true,
        token,
        admin: { email, name }
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
          email: decoded.email,
          name: decoded.name || getAdminName(decoded.email)
        }
      });
    }

    // IMPERSONATE-SELLER - Issue a short-lived token for an admin to view a seller's portal
    if (action === 'impersonate-seller') {
      const authHeader = req.headers.authorization;
      const adminToken = authHeader?.replace('Bearer ', '');
      const decoded = adminToken ? verifyToken(adminToken) : null;
      if (!decoded || decoded.type !== 'admin') {
        return res.status(401).json({ error: 'Admin auth required' });
      }

      const { sellerId } = req.body;
      if (!sellerId) {
        return res.status(400).json({ error: 'sellerId required' });
      }

      const { data: seller, error: sellerErr } = await supabase
        .from('sellers')
        .select('id, email, name')
        .eq('id', sellerId)
        .single();

      if (sellerErr || !seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Audit log (non-blocking)
      console.log(`🔍 IMPERSONATION: admin=${decoded.email} viewing seller=${seller.email} (${seller.id})`);

      const impersonationToken = jwt.sign(
        {
          type: 'seller_impersonation',
          sellerId: seller.id,
          sellerEmail: seller.email,
          adminEmail: decoded.email
        },
        JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.status(200).json({
        success: true,
        token: impersonationToken,
        sellerEmail: seller.email,
        sellerName: seller.name
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: error.message });
  }
}
