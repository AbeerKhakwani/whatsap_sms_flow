// lib/auth-utils.js
// Authentication utilities

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'phirstory-jwt-secret-change-in-production';
const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/**
 * Generate a 6-digit verification code
 */
export function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store verification code in database
 */
export async function storeVerificationCode(identifier, code, channel = 'email') {
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  // Delete any existing codes for this identifier
  await supabase
    .from('auth_codes')
    .delete()
    .eq('identifier', identifier.toLowerCase());

  const { error } = await supabase
    .from('auth_codes')
    .insert({
      identifier: identifier.toLowerCase(),
      code,
      channel,
      expires_at: expiresAt.toISOString(),
      attempts: 0
    });

  if (error) {
    console.error('Error storing code:', error);
    return false;
  }
  return true;
}

/**
 * Verify a code
 */
export async function verifyCode(identifier, code) {
  const { data, error } = await supabase
    .from('auth_codes')
    .select('*')
    .eq('identifier', identifier.toLowerCase())
    .eq('used', false)
    .single();

  if (error || !data) {
    return { valid: false, error: 'Code not found. Request a new one.' };
  }

  // Check expiry
  if (new Date(data.expires_at) < new Date()) {
    await supabase.from('auth_codes').delete().eq('id', data.id);
    return { valid: false, error: 'Code expired. Request a new one.' };
  }

  // Check attempts
  if (data.attempts >= MAX_ATTEMPTS) {
    await supabase.from('auth_codes').delete().eq('id', data.id);
    return { valid: false, error: 'Too many attempts. Request a new code.' };
  }

  // Check code
  if (data.code !== code) {
    await supabase
      .from('auth_codes')
      .update({ attempts: data.attempts + 1 })
      .eq('id', data.id);
    return { valid: false, error: `Incorrect code. ${MAX_ATTEMPTS - data.attempts - 1} attempts left.` };
  }

  // Code is valid - mark as used
  await supabase
    .from('auth_codes')
    .update({ used: true })
    .eq('id', data.id);

  return { valid: true };
}

/**
 * Generate JWT token for seller
 */
export function generateSellerToken(seller) {
  return jwt.sign(
    {
      id: seller.id,
      email: seller.email,
      phone: seller.phone,
      type: 'seller'
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Generate JWT token for admin
 */
export function generateAdminToken(email) {
  return jwt.sign(
    {
      email,
      type: 'admin'
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Verify admin password
 */
export async function verifyAdminPassword(password) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    console.error('ADMIN_PASSWORD_HASH not configured');
    return false;
  }
  return bcrypt.compareSync(password, hash);
}

/**
 * Hash a password (utility for generating hashes)
 */
export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

/**
 * Check if email is in admin list
 */
export function isAdminEmail(email) {
  const adminEmails = (process.env.ADMIN_EMAILS || 'thephirstory@gmail.com').split(',').map(e => e.trim().toLowerCase());
  return adminEmails.includes(email.toLowerCase());
}
