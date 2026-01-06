// api/auth.js
// Auth endpoint - handles seller login with email/phone verification

import { createClient } from '@supabase/supabase-js';
import { sendVerificationCode, sendWelcomeEmail } from '../lib/email.js';
import {
  generateCode,
  storeVerificationCode,
  verifyCode,
  generateSellerToken,
  verifyToken
} from '../lib/auth-utils.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

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
    // CHECK-USER - See if email or phone exists
    if (action === 'check-user') {
      const { identifier } = req.body;
      if (!identifier) {
        return res.status(400).json({ error: 'Email or phone required' });
      }

      const seller = await findSeller(identifier);

      return res.status(200).json({
        success: true,
        exists: !!seller,
        hasPhone: !!seller?.phone,
        hasEmail: !!seller?.email,
        name: seller?.name || null
      });
    }

    // SEND-CODE - Send verification code via email or WhatsApp
    if (action === 'send-code') {
      let { email, phone, channel } = req.body;

      if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
      }

      // If WhatsApp channel requested but no phone provided, look up seller's phone
      if (channel === 'whatsapp' && !phone && email) {
        const seller = await findSeller(email);
        if (seller?.phone) {
          phone = seller.phone;
        } else {
          return res.status(400).json({ error: 'No phone number on file' });
        }
      }

      const code = generateCode();
      const identifier = email || phone;

      // Store code
      const stored = await storeVerificationCode(identifier, code, channel || 'email');
      if (!stored) {
        return res.status(500).json({ error: 'Failed to generate code' });
      }

      // Send code via appropriate channel
      if (channel === 'whatsapp' && phone) {
        const sent = await sendWhatsAppCode(phone, code);
        if (!sent) {
          return res.status(500).json({ error: 'Failed to send WhatsApp message' });
        }
        return res.status(200).json({
          success: true,
          message: 'Code sent via WhatsApp',
          channel: 'whatsapp'
        });
      } else if (email) {
        const sent = await sendVerificationCode(email, code);
        if (!sent) {
          return res.status(500).json({ error: 'Failed to send email' });
        }
        return res.status(200).json({
          success: true,
          message: 'Code sent to your email',
          channel: 'email'
        });
      }

      return res.status(400).json({ error: 'No valid channel for sending code' });
    }

    // VERIFY-CODE - Verify code and return token
    if (action === 'verify-code') {
      const { identifier, code, phone: newPhone } = req.body;

      if (!identifier || !code) {
        return res.status(400).json({ error: 'Identifier and code required' });
      }

      // Verify the code
      const result = await verifyCode(identifier, code);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }

      // Find or create seller
      let seller = await findSeller(identifier);

      if (!seller) {
        // New seller - create account
        const isEmail = identifier.includes('@');
        const { data, error } = await supabase
          .from('sellers')
          .insert({
            email: isEmail ? identifier.toLowerCase() : null,
            phone: isEmail ? newPhone : identifier,
            name: isEmail ? identifier.split('@')[0] : null
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating seller:', error);
          return res.status(500).json({ error: 'Failed to create account' });
        }
        seller = data;

        // Send welcome email if we have email
        if (seller.email) {
          await sendWelcomeEmail(seller.email, seller.name);
        }
      } else {
        // Existing seller - update phone if provided and not set
        if (newPhone && !seller.phone) {
          const { data } = await supabase
            .from('sellers')
            .update({ phone: newPhone })
            .eq('id', seller.id)
            .select()
            .single();
          seller = data || seller;
        }
      }

      // Generate token
      const token = generateSellerToken(seller);

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

    // VERIFY-TOKEN - Check if token is valid
    if (action === 'verify-token') {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '') || req.body.token;

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const decoded = verifyToken(token);
      if (!decoded || decoded.type !== 'seller') {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get fresh seller data
      const { data: seller } = await supabase
        .from('sellers')
        .select('*')
        .eq('id', decoded.id)
        .single();

      if (!seller) {
        return res.status(401).json({ error: 'Seller not found' });
      }

      return res.status(200).json({
        success: true,
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

/**
 * Find seller by email or phone
 */
async function findSeller(identifier) {
  const isEmail = identifier.includes('@');

  if (isEmail) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .ilike('email', identifier.toLowerCase())
      .maybeSingle();
    return data;
  }

  // Phone - try multiple formats
  const digits = identifier.replace(/\D/g, '');
  const formats = [
    identifier,
    digits,
    digits.slice(-10),
    '+' + digits,
    '+1' + digits.slice(-10),
  ].filter(f => f && f.length > 0);

  const { data } = await supabase
    .from('sellers')
    .select('*')
    .in('phone', formats)
    .maybeSingle();

  return data;
}

/**
 * Send verification code via WhatsApp
 */
async function sendWhatsAppCode(phone, code) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.error('WhatsApp not configured');
    return false;
  }

  const to = phone.replace(/\D/g, '');

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: {
            body: `Your The Phir Story login code is: ${code}\n\nThis code expires in 10 minutes.`
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('WhatsApp error:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return false;
  }
}
