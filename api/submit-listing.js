// api/submit-listing.js
// Create a draft listing in Shopify with full product details
// Also creates/updates seller in Supabase

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
        const {
            email,
            phone,
            designer,
            productName,
            size,
            condition,
            color,
            material,
            description,
            originalPrice,
            askingPrice
        } = req.body;

        if (!designer || !productName) {
            return res.status(400).json({ error: 'Please provide designer and product name' });
        }

        // Find or create seller in Supabase
        let seller = null;
        if (email || phone) {
            // Try to find existing seller by email or phone
            let query = supabase.from('sellers').select('*');

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

            // Create new seller if not found
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

                if (sellerError) {
                    console.error('Error creating seller:', sellerError);
                } else {
                    seller = newSeller;
                }
            }
        }

        // Create draft product in Shopify (matching approve-listing.js structure)
        const shopifyProduct = {
            product: {
                title: `${designer} - ${productName}`,
                body_html: `<p>${description || ''}</p>
                    <p><strong>Designer:</strong> ${designer}</p>
                    <p><strong>Size:</strong> ${size || 'Not specified'}</p>
                    <p><strong>Condition:</strong> ${condition || 'Not specified'}</p>
                    <p><strong>Color:</strong> ${color || 'Not specified'}</p>
                    <p><strong>Material:</strong> ${material || 'Premium fabric'}</p>
                    <p><strong>Original Price:</strong> $${originalPrice || 0}</p>
                    <hr>
                    <p><strong>Contact Email:</strong> ${email || 'Not provided'}</p>
                    <p><strong>Contact Phone:</strong> ${phone || 'Not provided'}</p>
                    <p><em>Submitted via web form on ${new Date().toISOString()}</em></p>`,
                vendor: designer,
                product_type: 'Pakistani Designer Wear',
                tags: [designer, size, condition, color, 'preloved', 'web-submission', 'needs-review'].filter(Boolean).join(', '),
                options: [
                    { name: 'Size', values: [size || 'One Size'] },
                    { name: 'Brand', values: [designer] },
                    { name: 'Condition', values: [condition || 'Not specified'] }
                ],
                variants: [{
                    option1: size || 'One Size',
                    option2: designer,
                    option3: condition || 'Not specified',
                    price: (askingPrice || 0).toString(),
                    compare_at_price: originalPrice ? originalPrice.toString() : null,
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
            const { error: listingError } = await supabase
                .from('listings')
                .insert({
                    seller_id: seller.id,
                    shopify_product_id: product.id.toString(),
                    designer: designer,
                    product_name: productName,
                    size: size || null,
                    condition: condition || null,
                    color: color || null,
                    material: material || null,
                    description: description || null,
                    original_price_usd: originalPrice || 0,
                    asking_price_usd: askingPrice || 0,
                    status: 'draft',
                    listing_data: {
                        contact_email: email,
                        contact_phone: phone,
                        submitted_via: 'web_form',
                        submitted_at: new Date().toISOString()
                    },
                    created_at: new Date().toISOString()
                });

            if (listingError) {
                console.error('Error creating listing in Supabase:', listingError);
            }
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
