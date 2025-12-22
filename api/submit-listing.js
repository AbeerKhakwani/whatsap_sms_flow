// api/submit-listing.js
// Create a draft listing in Shopify directly (without images)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, phone, description } = req.body;

        if (!description) {
            return res.status(400).json({ error: 'Please provide a description' });
        }

        // Create draft product in Shopify
        const shopifyProduct = {
            product: {
                title: 'Web Submission - ' + new Date().toLocaleDateString(),
                body_html: `<p>${description}</p>
                    <hr>
                    <p><strong>Contact Email:</strong> ${email || 'Not provided'}</p>
                    <p><strong>Contact Phone:</strong> ${phone || 'Not provided'}</p>
                    <p><em>Submitted via web form on ${new Date().toISOString()}</em></p>`,
                vendor: 'Web Submission',
                product_type: 'Pakistani Designer Wear',
                tags: 'web-submission, needs-review',
                status: 'draft'
            }
        };

        const createResponse = await fetch(
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

        if (!createResponse.ok) {
            const error = await createResponse.text();
            console.error('Shopify create error:', error);
            return res.status(500).json({ error: 'Failed to create Shopify draft' });
        }

        const { product } = await createResponse.json();

        return res.status(200).json({
            success: true,
            productId: product.id,
            shopifyUrl: `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/products/${product.id}`
        });

    } catch (error) {
        console.error('Submit listing error:', error);
        return res.status(500).json({
            error: 'Failed to submit listing',
            details: error.message
        });
    }
}
