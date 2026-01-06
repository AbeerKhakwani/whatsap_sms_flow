// api/approve-listing.js
// Approve a listing - change Shopify status from draft to active
// Send notification to seller

import { approveDraft, getProduct } from '../lib/shopify.js';
import { sendListingApproved } from '../lib/email.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const STORE_URL = process.env.VITE_SHOPIFY_STORE_URL?.replace('.myshopify.com', '');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { shopifyProductId, skipNotification } = req.body;

    if (!shopifyProductId) {
      return res.status(400).json({ error: 'Please provide shopifyProductId' });
    }

    // Get product details before approving (for notification)
    const productBefore = await getProduct(shopifyProductId);

    // Approve the draft
    const product = await approveDraft(shopifyProductId);

    // Get seller info from metafields
    const sellerEmail = getMetafieldValue(productBefore, 'seller', 'email');
    const sellerPayout = parseFloat(getMetafieldValue(productBefore, 'pricing', 'seller_payout')) || 0;

    // Get product URL
    const productHandle = product.handle;
    const productUrl = `https://${STORE_URL}.com/products/${productHandle}`;

    // Get seller info from database
    let seller = null;
    if (sellerEmail) {
      const { data } = await supabase
        .from('sellers')
        .select('*')
        .ilike('email', sellerEmail.toLowerCase())
        .maybeSingle();
      seller = data;
    }

    // Send notifications (unless skipped)
    if (!skipNotification && sellerEmail) {
      // Send email notification
      try {
        await sendListingApproved(
          sellerEmail,
          seller?.name || null,
          product.title,
          productUrl,
          sellerPayout
        );
        console.log(`Email notification sent to ${sellerEmail}`);
      } catch (emailErr) {
        console.error('Email notification error:', emailErr);
      }

      // Send WhatsApp notification if seller has phone
      if (seller?.phone && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        try {
          await sendWhatsAppNotification(
            seller.phone,
            seller.name,
            product.title,
            productUrl,
            sellerPayout
          );
          console.log(`WhatsApp notification sent to ${seller.phone}`);
        } catch (waErr) {
          console.error('WhatsApp notification error:', waErr);
        }
      }
    }

    return res.status(200).json({
      success: true,
      productId: product.id,
      shopifyUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`,
      productUrl,
      notificationSent: !skipNotification && !!sellerEmail
    });

  } catch (error) {
    console.error('Approve error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Get metafield value from product
 */
function getMetafieldValue(product, namespace, key) {
  const metafield = product.metafields?.find(
    m => m.namespace === namespace && m.key === key
  );
  return metafield?.value || null;
}

/**
 * Send WhatsApp notification when listing is approved
 */
async function sendWhatsAppNotification(phone, sellerName, productTitle, productUrl, sellerPayout) {
  const to = phone.replace(/\D/g, '');

  const greeting = sellerName ? `Hi ${sellerName}! ` : '';
  const message = `${greeting}Great news! Your listing "${productTitle}" is now live on The Phir Story.

When it sells, you'll receive $${sellerPayout.toFixed(2)}.

View your listing: ${productUrl}

Thanks for selling with us!`;

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
        text: { body: message }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp error: ${error}`);
  }

  return true;
}
