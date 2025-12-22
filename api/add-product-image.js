// api/add-product-image.js
// Add a single image to a Shopify product

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { productId, base64, filename } = req.body;

        if (!productId || !base64) {
            return res.status(400).json({ error: 'Missing productId or image data' });
        }

        const imageResponse = await fetch(
            `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${productId}/images.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
                },
                body: JSON.stringify({
                    image: {
                        attachment: base64,
                        filename: filename || 'photo.jpg'
                    }
                })
            }
        );

        if (!imageResponse.ok) {
            const error = await imageResponse.text();
            console.error('Shopify image upload error:', error);
            return res.status(500).json({ error: 'Failed to upload image' });
        }

        const data = await imageResponse.json();

        return res.status(200).json({
            success: true,
            imageId: data.image?.id
        });

    } catch (error) {
        console.error('Add image error:', error);
        return res.status(500).json({
            error: 'Failed to add image',
            details: error.message
        });
    }
}
