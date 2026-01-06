// api/admin-auth.js
// Admin authentication with bcrypt password and JWT tokens

import {
  verifyAdminPassword,
  generateAdminToken,
  verifyToken,
  isAdminEmail
} from '../lib/auth-utils.js';

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
    // LOGIN - Verify password and return token
    if (action === 'login') {
      const { password, email } = req.body;

      if (!password) {
        return res.status(400).json({ error: 'Password required' });
      }

      // Optionally check if email is in admin list
      if (email && !isAdminEmail(email)) {
        return res.status(401).json({ error: 'Not authorized' });
      }

      const valid = await verifyAdminPassword(password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      const token = generateAdminToken(email || 'admin');

      return res.status(200).json({
        success: true,
        token
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

    // Legacy: no action = password check (backward compatibility)
    if (!action) {
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: 'Password required' });
      }

      const valid = await verifyAdminPassword(password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      const token = generateAdminToken('admin');

      return res.status(200).json({
        success: true,
        token
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: error.message });
  }
}
