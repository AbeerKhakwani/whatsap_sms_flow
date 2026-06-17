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
 * Generate JWT token for admin. `name` (display name) is embedded for attribution
 * ("by Faqiha") without a second lookup. `master` marks the email-code (Gmail) login
 * — the only session allowed to manage team passwords.
 */
export function generateAdminToken(email, name = null, master = false) {
  const payload = { email, type: 'admin' };
  if (name) payload.name = name;
  if (master) payload.master = true;
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

// ── Per-admin credentials (DB-backed) ────────────────────────────────────────
// Credentials live in the RLS-locked public.admin_credentials table, reachable only
// via the service-role client (lib/supabase-admin.js). Passwords are set/changed from
// the master-gated "Team passwords" screen — never stored in plain text or in env.

/** Capitalized email local-part, used when no explicit name is on file. */
function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : String(email || '');
}

/**
 * Password-only admin login: no email is entered — the password identifies the admin.
 * Compares against every admin's stored hash and returns the first match.
 * @returns {Promise<{email: string, name: string}|null>}
 */
export async function verifyAdminByPassword(password) {
  if (!password) return null;
  const { data, error } = await supabase
    .from('admin_credentials')
    .select('email, name, password_hash');
  if (error || !data) return null;
  for (const admin of data) {
    if (admin.password_hash && bcrypt.compareSync(password, admin.password_hash)) {
      return { email: admin.email, name: admin.name || displayNameFromEmail(admin.email) };
    }
  }
  return null;
}

/** Display name for an admin email (from admin_credentials, else capitalized local-part). */
export async function getAdminName(email) {
  if (!email) return null;
  const { data } = await supabase
    .from('admin_credentials')
    .select('name')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();
  return data?.name || displayNameFromEmail(email);
}

/** List admins for the management UI (never returns hashes). */
export async function listAdmins() {
  const { data, error } = await supabase
    .from('admin_credentials')
    .select('email, name, password_hash, updated_at')
    .order('name');
  if (error || !data) return [];
  return data.map(a => ({
    email: a.email,
    name: a.name,
    hasPassword: !!a.password_hash,
    updatedAt: a.updated_at,
  }));
}

/** Set/change an admin's password. Gated to master sessions at the API layer. */
export async function setAdminPassword(email, newPassword) {
  if (!email || !newPassword) return { ok: false, error: 'Email and password required' };
  const { data, error } = await supabase
    .from('admin_credentials')
    .update({ password_hash: bcrypt.hashSync(newPassword, 10), updated_at: new Date().toISOString() })
    .eq('email', email.toLowerCase().trim())
    .select('email')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Admin not found' };
  return { ok: true };
}
