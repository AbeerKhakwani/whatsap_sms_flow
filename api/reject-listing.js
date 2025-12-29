// api/reject-listing.js
// Reject a listing - deletes Shopify draft and removes from seller's array

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({ error: 'Please provide listingId' });
    }

    // Get listing
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('*, sellers(*)')
      .eq('id', listingId)
      .single();

    if (fetchError) throw fetchError;
    if (!listing) throw new Error('Listing not found');

    const shopifyProductId = listing.shopify_product_id;

    // Delete from Shopify if product exists
    if (shopifyProductId) {
      const shopifyResponse = await fetch(
        `https://${process.env.VITE_SHOPIFY_STORE_URL}/admin/api/2024-10/products/${shopifyProductId}.json`,
        {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': process.env.VITE_SHOPIFY_ACCESS_TOKEN
          }
        }
      );

      if (!shopifyResponse.ok && shopifyResponse.status !== 404) {
        console.error('Shopify delete error:', await shopifyResponse.text());
        // Continue anyway - we still want to clean up our records
      } else {
        console.log(`Deleted Shopify product: ${shopifyProductId}`);
      }

      // Remove from seller's shopify_product_ids array
      if (listing.seller_id) {
        const { data: seller } = await supabase
          .from('sellers')
          .select('shopify_product_ids')
          .eq('id', listing.seller_id)
          .single();

        if (seller?.shopify_product_ids) {
          const updatedIds = seller.shopify_product_ids.filter(
            id => id !== shopifyProductId && id !== shopifyProductId.toString()
          );

          await supabase
            .from('sellers')
            .update({ shopify_product_ids: updatedIds })
            .eq('id', listing.seller_id);

          console.log(`Removed ${shopifyProductId} from seller's array`);
        }
      }
    }

    // Update listing status to rejected
    await supabase
      .from('listings')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString()
      })
      .eq('id', listingId);

    return res.status(200).json({
      success: true,
      message: 'Listing rejected and Shopify draft deleted'
    });

  } catch (error) {
    console.error('Reject error:', error);
    return res.status(500).json({ error: error.message });
  }
}
