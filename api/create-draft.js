// api/create-draft.js
// Creates a Shopify DRAFT product with pending-approval tag

import { createDraft } from '../lib/shopify.js';
import { findOrCreateSeller, addProductToSeller } from '../lib/sellers.js';
import { validateAndSanitize } from '../lib/security.js';
import { cors } from '../lib/cors.js';
import { sendEmail } from '../lib/send-email.js';

export default async function handler(req, res) {
  if (cors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, phone, description, extracted } = req.body;

    if (!description && !extracted) {
      return res.status(400).json({ error: 'Please provide description or extracted fields' });
    }

    const fields = extracted || {};

    // AI Security Validation
    const validation = await validateAndSanitize({
      description,
      designer: fields.designer,
      item_type: fields.item_type,
      color: fields.color,
      material: fields.material,
      condition: fields.condition,
      additional_details: fields.additional_details,
      asking_price: fields.asking_price,
      original_price: fields.original_price
    });

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.message,
        issues: validation.issues
      });
    }

    // Use sanitized data
    const safeFields = validation.data;

    // Find or create seller FIRST so we have their ID and phone
    let seller = null;
    if (email || phone) {
      try {
        seller = await findOrCreateSeller({ email, phone });
        console.log('👤 Seller found/created:', seller?.id, seller?.email, seller?.phone);
      } catch (err) {
        console.error('Seller lookup error (non-fatal):', err);
      }
    }

    console.log('📦 Creating Shopify draft:', {
      designer: safeFields.designer,
      itemType: safeFields.item_type,
      size: fields.size,
      askingPrice: safeFields.asking_price,
      sellerEmail: email,
      sellerId: seller?.id,
      sellerPhone: seller?.phone
    });

    // Create Shopify draft with seller info in metafields
    const product = await createDraft({
      designer: safeFields.designer,
      itemType: safeFields.item_type,
      size: fields.size, // size is a select, not free text
      condition: safeFields.condition,
      askingPrice: safeFields.asking_price,
      color: safeFields.color,
      material: safeFields.material,
      description: safeFields.description,
      sellerEmail: email,
      sellerId: seller?.id?.toString() || '',
      sellerPhone: seller?.phone || '',
      chest: fields.chest || '',
      hip: fields.hip || '',
      notes: fields.notes || '',
      originalPrice: fields.original_price || ''
    });

    console.log('✅ Shopify draft created:', product.id);

    // Link product to seller
    if (seller) {
      try {
        await addProductToSeller(seller.id, product.id);
      } catch (err) {
        console.error('Product linking error (non-fatal):', err);
      }
    }

    // Notify admin of new listing
    const shopifyAdminUrl = `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`;
    try {
      await sendEmail({
        to: 'thephirstory@gmail.com',
        subject: `New Listing: ${safeFields.designer || 'Unknown'} - ${safeFields.item_type || 'Item'}`,
        html: `<h3>New listing submitted</h3>
          <p><strong>Designer:</strong> ${safeFields.designer || 'Unknown'}</p>
          <p><strong>Item:</strong> ${safeFields.item_type || 'Unknown'}</p>
          <p><strong>Size:</strong> ${fields.size || 'One Size'}</p>
          <p><strong>Asking Price:</strong> $${safeFields.asking_price || 0}</p>
          <p><strong>Seller:</strong> ${email || 'Unknown'} ${seller?.phone ? `(${seller.phone})` : ''}</p>
          <p><a href="${shopifyAdminUrl}">View in Shopify</a></p>`,
        context: 'new_listing_admin'
      });
    } catch (emailErr) {
      console.error('Admin notification email error (non-fatal):', emailErr);
    }

    return res.status(200).json({
      success: true,
      productId: product.id,
      message: 'Draft created - add photos next'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
