import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const { listingId, description, email, phone } = req.body;

    // Mode 1: Web submission (create draft directly)
    if (description) {
      return await handleWebSubmission(req, res, supabase, { description, email, phone });
    }

    // Mode 2: Approve existing listing
    if (listingId) {
      return await handleApproveListing(req, res, supabase, listingId);
    }

    return res.status(400).json({ error: 'Please provide listingId or description' });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Handle web form submission - create Shopify draft
async function handleWebSubmission(req, res, supabase, { description, email, phone }) {
  // Find or create seller
  let seller = null;
  if (email || phone) {
    if (email) {
      const { data: emailSeller } = await supabase
        .from('sellers')
        .select('*')
        .eq('email', email)
        .single();
      if (emailSeller) seller = emailSeller;
    }

    if (!seller && phone) {
      const { data: phoneSeller } = await supabase
        .from('sellers')
        .select('*')
        .eq('phone', phone)
        .single();
      if (phoneSeller) seller = phoneSeller;
    }

    if (!seller) {
      const { data: newSeller, error: sellerError } = await supabase
        .from('sellers')
        .insert({
          email: email || null,
          phone: phone || null,
          name: email ? email.split('@')[0] : 'Web Seller',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (!sellerError) seller = newSeller;
    }
  }

  // Create Shopify draft with TBD placeholders
  const shopifyProduct = {
    product: {
      title: 'Web Submission - ' + new Date().toLocaleDateString(),
      body_html: `<p>${description}</p>
        <p><strong>Designer:</strong> TBD</p>
        <p><strong>Size:</strong> TBD</p>
        <p><strong>Condition:</strong> TBD</p>
        <p><strong>Color:</strong> TBD</p>
        <p><strong>Material:</strong> Premium fabric</p>
        <p><strong>Original Price:</strong> $0</p>
        <hr>
        <p><strong>Contact Email:</strong> ${email || 'Not provided'}</p>
        <p><strong>Contact Phone:</strong> ${phone || 'Not provided'}</p>
        <p><em>Submitted via web form on ${new Date().toISOString()}</em></p>`,
      vendor: 'Web Submission',
      product_type: 'Pakistani Designer Wear',
      tags: ['preloved', 'web-submission', 'needs-review'].filter(Boolean).join(', '),
      options: [
        { name: 'Size', values: ['TBD'] },
        { name: 'Brand', values: ['TBD'] },
        { name: 'Condition', values: ['TBD'] }
      ],
      variants: [{
        option1: 'TBD',
        option2: 'TBD',
        option3: 'TBD',
        price: '0',
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
    console.error('Shopify create error:', error);
    throw new Error('Failed to create Shopify draft');
  }

  const { product } = await shopifyResponse.json();

  // Create listing record in Supabase
  if (seller) {
    await supabase
      .from('listings')
      .insert({
        seller_id: seller.id,
        shopify_product_id: product.id.toString(),
        description: description,
        status: 'draft',
        listing_data: {
          contact_email: email,
          contact_phone: phone,
          submitted_via: 'web_form',
          submitted_at: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      });
  }

  return res.status(200).json({
    success: true,
    productId: product.id,
    sellerId: seller?.id,
    shopifyUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`
  });
}

// Handle approving an existing listing from Supabase
async function handleApproveListing(req, res, supabase, listingId) {
  // Get listing
  const { data: listing, error: fetchError } = await supabase
    .from('listings')
    .select('*, sellers(*)')
    .eq('id', listingId)
    .single();

  if (fetchError) throw fetchError;
  if (!listing) throw new Error('Listing not found');

  // Create in Shopify
  const shopifyProduct = {
    product: {
      title: `${listing.designer} - ${listing.product_name}`,
      body_html: `<p>${listing.description}</p>
        <p><strong>Designer:</strong> ${listing.designer}</p>
        <p><strong>Size:</strong> ${listing.size}</p>
        <p><strong>Condition:</strong> ${listing.condition}</p>
        <p><strong>Color:</strong> ${listing.color}</p>
        <p><strong>Material:</strong> ${listing.material || 'Premium fabric'}</p>
        <p><strong>Original Price:</strong> $${listing.original_price_usd}</p>`,
      vendor: listing.designer,
      product_type: 'Pakistani Designer Wear',
      tags: [listing.designer, listing.size, listing.condition, listing.color, 'preloved'].filter(Boolean).join(', '),
      images: (listing.images || []).map(url => ({ src: url })),
      options: [
        { name: 'Size', values: [listing.size] },
        { name: 'Brand', values: [listing.designer] },
        { name: 'Condition', values: [listing.condition] }
      ],
      variants: [{
        option1: listing.size,
        option2: listing.designer,
        option3: listing.condition,
        price: listing.asking_price_usd.toString(),
        inventory_management: 'shopify',
        inventory_quantity: 1
      }],
      status: 'active'
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
    throw new Error(`Shopify error: ${error}`);
  }

  const { product } = await shopifyResponse.json();

  // Delete images from Supabase
  if (listing.images && listing.images.length > 0) {
    for (const url of listing.images) {
      try {
        const match = url.match(/listing-images\/(.+)$/);
        if (match) {
          await supabase.storage.from('listing-images').remove([match[1]]);
        }
      } catch (e) {
        console.log('Could not delete image:', e);
      }
    }
  }

  // Update listing
  await supabase
    .from('listings')
    .update({
      shopify_product_id: product.id.toString(),
      status: 'live',
      approved_at: new Date().toISOString(),
      images: []
    })
    .eq('id', listingId);

  return res.status(200).json({
    success: true,
    productId: product.id,
    shopifyUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`
  });
}
