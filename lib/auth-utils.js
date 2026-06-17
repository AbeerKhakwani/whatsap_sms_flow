// lib/auth-utils.js
// Authentication utilities

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from './supabase-admin.js';

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
 * Generate JWT token for admin. `name` (the display name) is embedded when known
 * so it can attribute actions ("by Faqiha") without a second lookup.
 */
export function generateAdminToken(email, name = null) {
  const payload = { email, type: 'admin' };
  if (name) payload.name = name;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
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

// ── Per-admin credentials ───────────────────────────────────────────────────
// ADMIN_USERS is the single source of truth for password login AND the Slack
// display-name map. It's a JSON array of { email, name, hash } where `hash` is a
// bcrypt hash (generate with `node scripts/hash-password.mjs "<password>"`).
// Example:
//   ADMIN_USERS='[{"email":"abeerkhakwani@gmail.com","name":"Abeer","hash":"$2b$10$..."},
//                 {"email":"faqiha@...","name":"Faqiha","hash":"$2b$10$..."}]'

/** Parse ADMIN_USERS. Returns [] if unset or malformed (never throws). */
export function getAdminUsers() {
  const raw = process.env.ADMIN_USERS;
  if (!raw) return [];
  try {
    const users = JSON.parse(raw);
    return Array.isArray(users) ? users : [];
  } catch (e) {
    console.error('ADMIN_USERS is not valid JSON:', e.message);
    return [];
  }
}

/** Capitalized email local-part, used when no explicit name is on file. */
function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : String(email || '');
}

/**
 * Password-only admin login: no email is entered — the password itself identifies
 * the admin. Checks the password against every ADMIN_USERS entry's hash and returns
 * the first match. (Passwords must be unique per admin, which they are.)
 * @returns {{email: string, name: string}|null}
 */
export function verifyAdminByPassword(password) {
  if (!password) return null;
  for (const user of getAdminUsers()) {
    if (user.hash && bcrypt.compareSync(password, user.hash)) {
      return { email: user.email, name: user.name || displayNameFromEmail(user.email) };
    }
  }
  return null;
}

/** Display name for an admin email (from ADMIN_USERS, else capitalized local-part). */
export function getAdminName(email) {
  if (!email) return null;
  const user = getAdminUsers().find(u => (u.email || '').toLowerCase().trim() === email.toLowerCase().trim());
  return user?.name || displayNameFromEmail(email);
}
