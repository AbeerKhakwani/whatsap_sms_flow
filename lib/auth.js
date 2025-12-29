// lib/auth.js
// Authentication utilities for seller portal

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const getSupabase = () => createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Generate a 6-digit verification code
 */
export function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store verification code for email/phone
 */
export async function storeVerificationCode(identifier, code) {
  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing codes for this identifier
  await supabase
    .from('verification_codes')
    .delete()
    .eq('identifier', identifier);

  // Insert new code
  const { error } = await supabase
    .from('verification_codes')
    .insert({
      identifier,
      code,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    });

  if (error) throw error;
  return true;
}

/**
 * Verify a code and return the seller if valid
 */
export async function verifyCode(identifier, code) {
  const supabase = getSupabase();

  // Get the stored code
  const { data: stored } = await supabase
    .from('verification_codes')
    .select('*')
    .eq('identifier', identifier)
    .eq('code', code)
    .single();

  if (!stored) {
    return { valid: false, error: 'Invalid code' };
  }

  // Check expiry
  if (new Date(stored.expires_at) < new Date()) {
    await supabase.from('verification_codes').delete().eq('id', stored.id);
    return { valid: false, error: 'Code expired' };
  }

  // Delete the used code
  await supabase.from('verification_codes').delete().eq('id', stored.id);

  // Find or create seller
  const isEmail = identifier.includes('@');
  let seller = null;

  if (isEmail) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .eq('email', identifier)
      .single();
    seller = data;
  } else {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .eq('phone', identifier)
      .single();
    seller = data;
  }

  // Create seller if doesn't exist
  if (!seller) {
    const { data: newSeller } = await supabase
      .from('sellers')
      .insert({
        email: isEmail ? identifier : null,
        phone: isEmail ? null : identifier,
        name: isEmail ? identifier.split('@')[0] : 'Seller',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    seller = newSeller;
  }

  return { valid: true, seller };
}

/**
 * Find or create seller from Google profile
 */
export async function findOrCreateSellerFromGoogle({ email, name, googleId }) {
  const supabase = getSupabase();

  // Try to find by email
  let { data: seller } = await supabase
    .from('sellers')
    .select('*')
    .eq('email', email)
    .single();

  if (!seller) {
    // Create new seller
    const { data: newSeller } = await supabase
      .from('sellers')
      .insert({
        email,
        name: name || email.split('@')[0],
        google_id: googleId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    seller = newSeller;
  } else if (!seller.google_id && googleId) {
    // Link Google ID to existing seller
    await supabase
      .from('sellers')
      .update({ google_id: googleId })
      .eq('id', seller.id);
  }

  return seller;
}

/**
 * Generate JWT token for seller
 */
export function generateToken(seller) {
  return jwt.sign(
    {
      sellerId: seller.id,
      email: seller.email,
      phone: seller.phone
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Verify JWT token and return seller data
 */
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, data: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Get seller from token
 */
export async function getSellerFromToken(token) {
  const { valid, data, error } = verifyToken(token);

  if (!valid) {
    return { seller: null, error };
  }

  const supabase = getSupabase();
  const { data: seller } = await supabase
    .from('sellers')
    .select('*')
    .eq('id', data.sellerId)
    .single();

  return { seller, error: seller ? null : 'Seller not found' };
}

/**
 * Send verification code via email (using a simple approach)
 */
export async function sendEmailCode(email, code) {
  // For now, log the code (in production, use SendGrid, Resend, etc.)
  console.log(`📧 Verification code for ${email}: ${code}`);

  // TODO: Integrate with email service
  // Example with Resend:
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'noreply@thephirstory.com',
  //   to: email,
  //   subject: 'Your verification code',
  //   html: `<p>Your code is: <strong>${code}</strong></p>`
  // });

  return true;
}

/**
 * Send verification code via SMS (using Twilio)
 */
export async function sendSMSCode(phone, code) {
  // For now, log the code
  console.log(`📱 Verification code for ${phone}: ${code}`);

  // TODO: Use Twilio
  // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  // await twilio.messages.create({
  //   body: `Your Phir Story verification code is: ${code}`,
  //   from: process.env.TWILIO_PHONE,
  //   to: phone
  // });

  return true;
}
