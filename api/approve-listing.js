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

  try {
    const { listingId } = req.body;

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

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

    res.status(200).json({ 
      success: true, 
      productId: product.id,
      shopifyUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
