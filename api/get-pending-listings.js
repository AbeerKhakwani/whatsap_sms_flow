// api/get-pending-listings.js
// Fetch draft products from Shopify with pending-approval tag

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const shopifyUrl = process.env.VITE_SHOPIFY_STORE_URL;
    const token = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

    // Fetch draft products with pending-approval tag
    const response = await fetch(
      `https://${shopifyUrl}/admin/api/2024-10/products.json?status=draft&limit=50`,
      {
        headers: { 'X-Shopify-Access-Token': token }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch from Shopify');
    }

    const { products } = await response.json();

    // Filter to only those with pending-approval tag
    const pending = products.filter(p =>
      p.tags && p.tags.toLowerCase().includes('pending-approval')
    );

    // Transform to simpler format for dashboard
    const listings = pending.map(product => {
      const variant = product.variants?.[0] || {};
      const tags = product.tags?.split(', ') || [];

      // Extract fields from tags or body
      const designer = product.vendor || 'Unknown Designer';
      const size = variant.option1 || 'One Size';
      const condition = variant.option3 || 'Good';

      return {
        id: product.id,
        shopify_product_id: product.id,
        product_name: product.title,
        designer: designer,
        size: size,
        condition: condition,
        asking_price_usd: parseFloat(variant.price) || 0,
        description: product.body_html?.replace(/<[^>]*>/g, ' ').trim() || '',
        images: product.images?.map(img => img.src) || [],
        created_at: product.created_at,
        shopify_admin_url: `https://${shopifyUrl}/admin/products/${product.id}`,
        tags: tags
      };
    });

    // Also get counts for stats
    const activeResponse = await fetch(
      `https://${shopifyUrl}/admin/api/2024-10/products/count.json?status=active`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const { count: activeCount } = await activeResponse.json();

    return res.status(200).json({
      success: true,
      listings,
      stats: {
        pending: listings.length,
        approved: activeCount || 0,
        sold: 0 // Would need order tracking for this
      }
    });

  } catch (error) {
    console.error('Error fetching pending listings:', error);
    return res.status(500).json({ error: error.message });
  }
}
