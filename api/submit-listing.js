// api/submit-listing.js
// Create a draft listing in Shopify from description
// Fills all fields like approve-listing.js does

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, phone, description } = req.body;

        if (!description) {
            return res.status(400).json({ error: 'Please provide a description' });
        }

        // Find or create seller in Supabase
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

        // Create draft product in Shopify (matching approve-listing.js structure)
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
                tags: ['preloved', 'web-submission', 'needs-review'].join(', '),
                options: [
                    { name: 'Size', values: ['One Size'] },
                    { name: 'Brand', values: ['TBD'] },
                    { name: 'Condition', values: ['TBD'] }
                ],
                variants: [{
                    option1: 'One Size',
                    option2: 'TBD',
                    option3: 'TBD',
                    price: '0',
                    inventory_management: 'shopify',
                    inventory_quantity: 1
                }],
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

    } catch (error) {
        console.error('Submit listing error:', error);
        return res.status(500).json({
            error: 'Failed to submit listing',
            details: error.message
        });
    }
}
