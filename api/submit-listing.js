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
        const { email, phone, description, photos } = req.body;

        if (!description && (!photos || photos.length === 0)) {
            return res.status(400).json({ error: 'Please provide a description or photos' });
        }

        // Upload photos to Supabase storage
        const photoUrls = [];
        const timestamp = Date.now();

        if (photos && photos.length > 0) {
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];

                // photo is { data: base64, type: 'image/jpeg' }
                const buffer = Buffer.from(photo.data, 'base64');
                const extension = getExtensionFromContentType(photo.type);
                const filePath = `web-submissions/${timestamp}_${i + 1}.${extension}`;

                const { error: uploadError } = await supabase.storage
                    .from('listing-photos')
                    .upload(filePath, buffer, {
                        contentType: photo.type,
                        upsert: true
                    });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    continue;
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('listing-photos')
                    .getPublicUrl(filePath);

                photoUrls.push(publicUrl);
            }
        }

        // Create listing
        const { data: listing, error: listingError } = await supabase
            .from('listings')
            .insert({
                status: 'pending_approval',
                listing_data: {
                    description: description || '',
                    photos: photoUrls,
                    submitted_via: 'web_form',
                    submitted_at: new Date().toISOString()
                },
                images: photoUrls,
                description: description || '',
                // Store contact info in listing_data for now
                // Can be linked to seller later
            })
            .select()
            .single();

        if (listingError) {
            console.error('Listing error:', listingError);
            return res.status(500).json({ error: 'Failed to create listing' });
        }

        // Store contact info separately if provided
        if (email || phone) {
            await supabase
                .from('listings')
                .update({
                    listing_data: {
                        ...listing.listing_data,
                        contact_email: email || '',
                        contact_phone: phone || ''
                    }
                })
                .eq('id', listing.id);
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

function getExtensionFromContentType(contentType) {
    const map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'video/mp4': 'mp4'
    };
    return map[contentType] || 'jpg';
}
