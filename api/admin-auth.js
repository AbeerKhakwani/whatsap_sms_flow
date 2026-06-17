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
  getAdminName,
  listAdmins,
  setAdminPassword
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
    // LOGIN - Password-only (credentials in the admin_credentials table). No email
    // entered: the password itself identifies the admin (Abeer vs Faqiha). NOT a master
    // session — password logins can't manage team passwords (only the Gmail email-code
    // login can). Until a password is set via the Team passwords screen, nothing matches
    // and admins use the email-code master login below.
    if (action === 'login') {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password required' });
      }

      const admin = await verifyAdminByPassword(password);
      if (!admin) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      const token = generateAdminToken(admin.email, admin.name, false);
      return res.status(200).json({
        success: true,
        token,
        admin: { email: admin.email, name: admin.name, master: false }
      });
    }

    // LIST-ADMINS - master-only: powers the "Team passwords" screen (no hashes returned).
    if (action === 'list-admins') {
      const decoded = verifyToken(req.headers.authorization?.replace('Bearer ', ''));
      if (!decoded || decoded.type !== 'admin' || !decoded.master) {
        return res.status(403).json({ error: 'Master login required' });
      }
      return res.status(200).json({ success: true, admins: await listAdmins() });
    }

    // SET-ADMIN-PASSWORD - master-only: set/change a teammate's password.
    if (action === 'set-admin-password') {
      const decoded = verifyToken(req.headers.authorization?.replace('Bearer ', ''));
      if (!decoded || decoded.type !== 'admin' || !decoded.master) {
        return res.status(403).json({ error: 'Master login required' });
      }
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const result = await setAdminPassword(email, password);
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      return res.status(200).json({ success: true });
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

      // Generate token. The email-code (Gmail) login is the MASTER session — the only
      // one allowed to manage team passwords. Carries the display name for attribution.
      const name = await getAdminName(email);
      const token = generateAdminToken(email, name, true);

      return res.status(200).json({
        success: true,
        token,
        admin: { email, name, master: true }
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
          name: decoded.name || null,
          master: decoded.master || false
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
