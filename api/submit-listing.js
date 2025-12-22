// api/submit-listing.js
// Submit a listing from the web form

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, phone, description, photoUrls } = req.body;

        if (!description && (!photoUrls || photoUrls.length === 0)) {
            return res.status(400).json({ error: 'Please provide a description or photos' });
        }

        // Create listing (photos already uploaded by frontend)
        const { data: listing, error: listingError } = await supabase
            .from('listings')
            .insert({
                status: 'pending_approval',
                listing_data: {
                    description: description || '',
                    photos: photoUrls || [],
                    contact_email: email || '',
                    contact_phone: phone || '',
                    submitted_via: 'web_form',
                    submitted_at: new Date().toISOString()
                },
                images: photoUrls || [],
                description: description || '',
            })
            .select()
            .single();

        if (listingError) {
            console.error('Listing error:', listingError);
            return res.status(500).json({ error: 'Failed to create listing' });
        }

        return res.status(200).json({
            success: true,
            listingId: listing.id
        });

    } catch (error) {
        console.error('Submit listing error:', error);
        return res.status(500).json({
            error: 'Failed to submit listing',
            details: error.message
        });
    }
}
