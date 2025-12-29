// api/create-draft.js
// Creates a Shopify DRAFT product with pending-approval tag

import { createClient } from '@supabase/supabase-js';

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
    const designer = fields.designer || 'Unknown Designer';
    const itemType = fields.item_type || 'Designer Item';
    const size = fields.size || 'One Size';
    const condition = fields.condition || 'Good';
    const askingPrice = fields.asking_price || 0;
    const color = fields.color || '';
    const material = fields.material || '';

    // Create Shopify DRAFT product with pending-approval tag
    const shopifyProduct = {
      product: {
        title: `${designer} - ${itemType}`,
        body_html: `<p>${description || ''}</p>
          <p><strong>Designer:</strong> ${designer}</p>
          <p><strong>Size:</strong> ${size}</p>
          <p><strong>Condition:</strong> ${condition}</p>
          ${color ? `<p><strong>Color:</strong> ${color}</p>` : ''}
          ${material ? `<p><strong>Material:</strong> ${material}</p>` : ''}`,
        vendor: designer,
        product_type: 'Pakistani Designer Wear',
        tags: [designer, size, condition, color, 'preloved', 'pending-approval'].filter(Boolean).join(', '),
        options: [
          { name: 'Size', values: [size] },
          { name: 'Brand', values: [designer] },
          { name: 'Condition', values: [condition] }
        ],
        variants: [{
          option1: size,
          option2: designer,
          option3: condition,
          price: askingPrice.toString(),
          inventory_management: 'shopify',
          inventory_quantity: 1
        }],
        status: 'draft'
      }
    };

    const shopifyResponse = await fetch(
      `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(shopifyProduct)
      }
    );

    if (!shopifyResponse.ok) {
      const error = await shopifyResponse.text();
      console.error('Shopify error:', error);
      throw new Error('Failed to create Shopify draft');
    }

    const { product } = await shopifyResponse.json();
    console.log(`Created Shopify draft: ${product.id}`);

    // Track seller and their Shopify product IDs (optional - only if email/phone provided)
    if (email || phone) {
      try {
        const supabase = createClient(
          process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );

        // Find or create seller
        let seller = null;

        if (email) {
          const { data } = await supabase
            .from('sellers')
            .select('id, shopify_product_ids')
            .eq('email', email)
            .single();
          if (data) seller = data;
        }

        if (!seller && phone) {
          const { data } = await supabase
            .from('sellers')
            .select('id, shopify_product_ids')
            .eq('phone', phone)
            .single();
          if (data) seller = data;
        }

        if (!seller) {
          const { data: newSeller } = await supabase
            .from('sellers')
            .insert({
              email: email || null,
              phone: phone || null,
              name: email ? email.split('@')[0] : 'Web Seller',
              shopify_product_ids: [product.id.toString()],
              created_at: new Date().toISOString()
            })
            .select('id')
            .single();
          seller = newSeller;
        } else {
          // Add to existing seller's product IDs
          const currentIds = seller.shopify_product_ids || [];
          await supabase
            .from('sellers')
            .update({ shopify_product_ids: [...currentIds, product.id.toString()] })
            .eq('id', seller.id);
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
