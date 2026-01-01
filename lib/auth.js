// lib/auth.js
// Authentication using Supabase Auth (built-in magic links)

import { createClient } from '@supabase/supabase-js';

const getSupabase = () => createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Send magic link or OTP via email
 */
export async function sendEmailOTP(email) {
  const supabase = getSupabase();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true
    }
  });

  if (error) throw error;
  return true;
}

/**
 * Send OTP via phone
 * TODO: Replace with WhatsApp integration (not Twilio SMS)
 * For now, phone auth is disabled - use email instead
 */
export async function sendPhoneOTP(phone) {
  // WhatsApp integration coming soon
  throw new Error('Phone verification coming soon. Please use email for now.');
}

/**
 * Verify email OTP
 */
export async function verifyEmailOTP(email, token) {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email'
  });

  if (error) throw error;

  // Find or create seller linked to this auth user
  const seller = await findOrCreateSellerByEmail(email, data.user?.id);

  return { session: data.session, seller };
}

/**
 * Verify phone OTP
 * TODO: Replace with WhatsApp integration
 */
export async function verifyPhoneOTP(phone, token) {
  // WhatsApp integration coming soon
  throw new Error('Phone verification coming soon. Please use email for now.');
}

/**
 * Verify Google ID token and sign in
 */
export async function verifyGoogleToken(idToken) {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken
  });

  if (error) throw error;

  const email = data.user?.email;
  const seller = await findOrCreateSellerByEmail(email, data.user?.id);

  return { session: data.session, seller };
}

/**
 * Get user from Supabase access token
 */
export async function getUserFromToken(accessToken) {
  const supabase = getSupabase();

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid token' };
  }

  return { user, error: null };
}

/**
 * Get seller from Supabase access token
 */
export async function getSellerFromToken(accessToken) {
  const { user, error } = await getUserFromToken(accessToken);

  if (error || !user) {
    return { seller: null, error: error || 'Invalid token' };
  }

  const supabase = getSupabase();

  // Find seller by auth_user_id or email
  let { data: seller } = await supabase
    .from('sellers')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (!seller && user.email) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .eq('email', user.email)
      .single();
    seller = data;

    // Link auth_user_id if found by email
    if (seller) {
      await supabase
        .from('sellers')
        .update({ auth_user_id: user.id })
        .eq('id', seller.id);
    }
  }

  if (!seller && user.phone) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .eq('phone', user.phone)
      .single();
    seller = data;

    if (seller) {
      await supabase
        .from('sellers')
        .update({ auth_user_id: user.id })
        .eq('id', seller.id);
    }
  }

  return { seller, error: seller ? null : 'Seller not found' };
}

/**
 * Find or create seller by email
 */
async function findOrCreateSellerByEmail(email, authUserId) {
  const supabase = getSupabase();

  let { data: seller } = await supabase
    .from('sellers')
    .select('*')
    .eq('email', email)
    .single();

  if (!seller) {
    const { data: newSeller } = await supabase
      .from('sellers')
      .insert({
        email,
        name: email.split('@')[0],
        auth_user_id: authUserId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    seller = newSeller;
  } else if (authUserId && !seller.auth_user_id) {
    // Link auth user to existing seller
    await supabase
      .from('sellers')
      .update({ auth_user_id: authUserId })
      .eq('id', seller.id);
  }

  return seller;
}

/**
 * Find or create seller by phone
 */
async function findOrCreateSellerByPhone(phone, authUserId) {
  const supabase = getSupabase();

  let { data: seller } = await supabase
    .from('sellers')
    .select('*')
    .eq('phone', phone)
    .single();

  if (!seller) {
    const { data: newSeller } = await supabase
      .from('sellers')
      .insert({
        phone,
        name: 'Seller',
        auth_user_id: authUserId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    seller = newSeller;
  } else if (authUserId && !seller.auth_user_id) {
    await supabase
      .from('sellers')
      .update({ auth_user_id: authUserId })
      .eq('id', seller.id);
  }

  return seller;
}
