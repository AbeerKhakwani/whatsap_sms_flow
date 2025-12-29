// api/create-draft.js
// Creates a Shopify DRAFT product (for approval workflow)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS
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
    // extracted = { designer, item_type, size, condition, asking_price, color, material, etc }

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

    // Create Shopify DRAFT product
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
        status: 'draft'  // DRAFT - not visible to customers
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

    // Also save to Supabase listings table for tracking
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Find or create seller
    let sellerId = null;
    if (email || phone) {
      let seller = null;

      if (email) {
        const { data } = await supabase
          .from('sellers')
          .select('id')
          .eq('email', email)
          .single();
        if (data) seller = data;
      }

      if (!seller && phone) {
        const { data } = await supabase
          .from('sellers')
          .select('id')
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
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();
        if (newSeller) seller = newSeller;
      }

      sellerId = seller?.id;
    }

    // Create listing record
    await supabase
      .from('listings')
      .insert({
        seller_id: sellerId,
        shopify_product_id: product.id.toString(),
        status: 'pending_approval',
        description: description,
        listing_data: {
          ...fields,
          contact_email: email,
          contact_phone: phone,
          submitted_via: 'web_form',
          submitted_at: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      });

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
