// api/approve-listing.js
// Approve a listing - change Shopify status from draft to active, remove pending-approval tag

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
    const { shopifyProductId } = req.body;

    if (!shopifyProductId) {
      return res.status(400).json({ error: 'Please provide shopifyProductId' });
    }

    const shopifyUrl = process.env.VITE_SHOPIFY_STORE_URL;
    const token = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

    // First get current product to read existing tags
    const getResponse = await fetch(
      `https://${shopifyUrl}/admin/api/2024-10/products/${shopifyProductId}.json`,
      {
        headers: { 'X-Shopify-Access-Token': token }
      }
    );

    if (!getResponse.ok) {
      throw new Error('Product not found in Shopify');
    }

    const { product: currentProduct } = await getResponse.json();

    // Remove pending-approval tag, keep others
    const currentTags = currentProduct.tags?.split(', ') || [];
    const newTags = currentTags
      .filter(tag => tag.toLowerCase() !== 'pending-approval')
      .join(', ');

    // Update Shopify product: status to active, remove pending-approval tag
    const updateResponse = await fetch(
      `https://${shopifyUrl}/admin/api/2024-10/products/${shopifyProductId}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token
        },
        body: JSON.stringify({
          product: {
            id: shopifyProductId,
            status: 'active',
            tags: newTags
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      throw new Error(`Shopify error: ${error}`);
    }

    const { product } = await updateResponse.json();

    return res.status(200).json({
      success: true,
      productId: product.id,
      shopifyUrl: `https://${shopifyUrl}/admin/products/${product.id}`
    });

  } catch (error) {
    console.error('Approve error:', error);
    return res.status(500).json({ error: error.message });
  }
}
