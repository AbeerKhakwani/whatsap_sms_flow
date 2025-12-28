// api/submit-for-approval.js
// Creates a pending listing with images in Supabase (for dashboard approval)

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Extract product details from description using AI
async function extractProductDetails(description) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract product details from descriptions of Pakistani designer clothing.
Return a JSON object with these fields (use null if not mentioned):
- designer: brand name (e.g., "Sana Safinaz", "Zara Shahjahan", "Elan")
- item_type: type of item (e.g., "Lawn Suit", "Kurta", "Formal Dress")
- size: size mentioned (e.g., "S", "M", "L", "XL", or specific like "Small")
- condition: item condition (e.g., "New with Tags", "Like New", "Good", "Fair")
- color: main color(s)
- material: fabric type if mentioned (e.g., "Lawn", "Silk", "Chiffon", "Cotton")
- original_price_usd: original/retail price if mentioned (number only)
- asking_price_usd: asking/selling price if mentioned (number only)

Only return valid JSON, no other text.`
        },
        {
          role: 'user',
          content: description
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content.trim();
    const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('AI extraction error:', error);
    return null;
  }
}

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

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const { email, phone, description, imageUrls } = req.body;
    // imageUrls is array of Supabase public URLs (uploaded from frontend)

    if (!description && (!imageUrls || imageUrls.length === 0)) {
      return res.status(400).json({ error: 'Please provide description or images' });
    }

    // Extract product details from description using AI
    const details = await extractProductDetails(description || '') || {};

    // Find or create seller
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

    // Images already uploaded to Supabase from frontend
    const photoUrls = imageUrls || [];

    // Create listing with pending_approval status
    const listingData = {
      designer: details.designer || null,
      item_type: details.item_type || null,
      size: details.size || null,
      condition: details.condition || null,
      color: details.color || null,
      material: details.material || null,
      original_price_usd: details.original_price_usd || null,
      asking_price_usd: details.asking_price_usd || null,
      photos: photoUrls,
      contact_email: email,
      contact_phone: phone,
      submitted_via: 'web_form',
      submitted_at: new Date().toISOString()
    };

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .insert({
        seller_id: seller?.id || null,
        status: 'pending_approval',
        description: description,
        listing_data: listingData,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (listingError) {
      console.error('Listing creation error:', listingError);
      throw new Error('Failed to create listing');
    }

    return res.status(200).json({
      success: true,
      listingId: listing.id,
      photosUploaded: photoUrls.length,
      message: 'Listing submitted for approval'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
