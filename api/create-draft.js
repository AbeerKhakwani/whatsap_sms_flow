// api/create-draft.js
// Creates a Shopify DRAFT product with pending-approval tag

import { createDraft } from '../lib/shopify.js';
import { findOrCreateSeller, addProductToSeller } from '../lib/sellers.js';

export default async function handler(req, res) {
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
    const { email, phone, description, extracted } = req.body;

    if (!description && !extracted) {
      return res.status(400).json({ error: 'Please provide description or extracted fields' });
    }

    const fields = extracted || {};

    // Create Shopify draft
    const product = await createDraft({
      designer: fields.designer,
      itemType: fields.item_type,
      size: fields.size,
      condition: fields.condition,
      askingPrice: fields.asking_price,
      color: fields.color,
      material: fields.material,
      description
    });

    // Track seller (optional - only if email/phone provided)
    if (email || phone) {
      try {
        const seller = await findOrCreateSeller({ email, phone });
        if (seller) {
          await addProductToSeller(seller.id, product.id);
        }
      } catch (err) {
        console.error('Seller tracking error (non-fatal):', err);
      }
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
