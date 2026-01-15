// api/auth.js
// Auth endpoint - handles seller login with email/phone verification

import { createClient } from '@supabase/supabase-js';
import { sendVerificationCode, sendWelcomeEmail, sendListingApproved } from '../lib/email.js';
import {
  generateCode,
  storeVerificationCode,
  verifyCode,
  generateSellerToken,
  verifyToken
} from '../lib/auth-utils.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
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
        hasAddress: !!seller?.shipping_address,
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
        console.log('📧 Attempting to send email to:', email);
        const sent = await sendVerificationCode(email, code);
        console.log('📧 Email result:', JSON.stringify(sent));
        if (!sent || !sent.success) {
          console.error('📧 Email failed:', sent?.error);
          return res.status(500).json({ error: 'Failed to send email', details: sent?.error });
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
          phone: seller.phone,
          has_address: !!seller.shipping_address,
          shipping_address: seller.shipping_address || null
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
          phone: seller.phone,
          has_address: !!seller.shipping_address,
          shipping_address: seller.shipping_address || null
        }
      });
    }

    // TEST-EMAIL - Send test emails (for testing)
    if (action === 'test-email') {
      const { email, type } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      let result = false;
      let message = '';

      switch (type) {
        case 'code':
          result = await sendVerificationCode(email, '123456');
          message = 'Verification code email sent';
          break;
        case 'approved':
          result = await sendListingApproved(
            email,
            'Test Seller',
            'Beautiful Maria B Kurta - Size M',
            'https://thephirstory.com/products/test',
            82.00
          );
          message = 'Listing approved email sent';
          break;
        case 'welcome':
          result = await sendWelcomeEmail(email, 'Test Seller');
          message = 'Welcome email sent';
          break;
        default:
          return res.status(400).json({
            error: 'Invalid type. Use: code, approved, or welcome'
          });
      }

      return res.status(200).json({ success: result, message });
    }

    // UPDATE-PHONE - Add phone number to existing seller (after login)
    if (action === 'update-phone') {
      const { email, phone } = req.body;

      if (!email || !phone) {
        return res.status(400).json({ error: 'Email and phone required' });
      }

      // Find seller by email
      const { data: seller, error: findError } = await supabase
        .from('sellers')
        .select('*')
        .ilike('email', email.toLowerCase())
        .maybeSingle();

      if (findError || !seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Update phone
      const { error: updateError } = await supabase
        .from('sellers')
        .update({ phone })
        .eq('id', seller.id);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update phone' });
      }

      return res.status(200).json({
        success: true,
        message: 'Phone number added'
      });
    }

    // UPDATE-ADDRESS - Add/update shipping address
    if (action === 'update-address') {
      const { email, shipping_address } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      if (!shipping_address || !shipping_address.street_address || !shipping_address.city ||
          !shipping_address.state || !shipping_address.postal_code) {
        return res.status(400).json({ error: 'Complete shipping address required' });
      }

      // Find seller by email
      const { data: seller, error: findError } = await supabase
        .from('sellers')
        .select('*')
        .ilike('email', email.toLowerCase())
        .maybeSingle();

      if (findError || !seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Update shipping address
      const { error: updateError } = await supabase
        .from('sellers')
        .update({ shipping_address })
        .eq('id', seller.id);

      if (updateError) {
        console.error('Error updating address:', updateError);
        return res.status(500).json({ error: 'Failed to update address' });
      }

      return res.status(200).json({
        success: true,
        message: 'Shipping address updated',
        shipping_address
      });
    }

    // GET-PROFILE - Get seller profile including address
    if (action === 'get-profile') {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const { data: seller, error } = await supabase
        .from('sellers')
        .select('*')
        .ilike('email', email.toLowerCase())
        .maybeSingle();

      if (error || !seller) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      return res.status(200).json({
        success: true,
        seller: {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone,
          has_address: !!seller.shipping_address,
          shipping_address: seller.shipping_address || null
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

  // Phone - normalize and try multiple lookup strategies
  const digits = identifier.replace(/\D/g, '');
  const last10 = digits.slice(-10);

  // First try: exact match with different formats
  const formats = [
    identifier,
    digits,
    last10,
    `+${digits}`,
    `+1${last10}`,
  ].filter(Boolean);

  for (const format of formats) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .eq('phone', format)
      .maybeSingle();
    if (data) return data;
  }

  // Fallback: pattern match on last 10 digits
  if (last10.length === 10) {
    const { data } = await supabase
      .from('sellers')
      .select('*')
      .like('phone', `%${last10}`)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

/**
 * Send verification code via WhatsApp using approved template
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
          type: 'template',
          template: {
            name: 'login_code',
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: code }]
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }]
              }
            ]
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
