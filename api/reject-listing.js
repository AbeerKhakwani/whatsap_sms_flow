// api/reject-listing.js
// Reject a listing - delete Shopify draft product

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
    const { shopifyProductId } = req.body;

    if (!shopifyProductId) {
      return res.status(400).json({ error: 'Please provide shopifyProductId' });
    }

    const shopifyUrl = process.env.VITE_SHOPIFY_STORE_URL;
    const token = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

    // Delete the Shopify product
    const deleteResponse = await fetch(
      `https://${shopifyUrl}/admin/api/2024-10/products/${shopifyProductId}.json`,
      {
        method: 'DELETE',
        headers: { 'X-Shopify-Access-Token': token }
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const error = await deleteResponse.text();
      throw new Error(`Shopify delete error: ${error}`);
    }

    console.log(`Deleted Shopify product: ${shopifyProductId}`);

    return res.status(200).json({
      success: true,
      message: 'Listing rejected and Shopify draft deleted'
    });

  } catch (error) {
    console.error('Reject error:', error);
    return res.status(500).json({ error: error.message });
  }
}
