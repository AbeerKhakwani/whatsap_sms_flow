// api/wa-product-image.js
// WhatsApp-specific image upload endpoint
// Handles productId normalization, base64 normalization, and compression

import { addProductImage } from '../lib/shopify.js';

/**
 * Normalize Shopify product ID
 * Accepts both "gid://shopify/Product/123" and "123"
 */
function normalizeShopifyProductId(productId) {
  const s = String(productId || '');

  // Extract numeric ID from GID format or plain string
  const match = s.match(/(\d+)\s*$/);
  return match ? match[1] : s;
}

/**
 * Strip data URI prefix to get raw base64
 * Shopify REST API expects raw base64 in "attachment" field (not data URI)
 * Dashboard sends: canvas.toDataURL().split(',')[1] → raw base64
 */
function stripDataUriPrefix(base64) {
  const s = String(base64 || '').trim();
  if (!s) return s;

  // Strip data URI prefix if it exists: "data:image/jpeg;base64,xxxxx" → "xxxxx"
  if (s.startsWith('data:image/')) {
    const parts = s.split(',');
    return parts[1] || s;
  }

  // Strip accidental "base64," prefix
  if (s.startsWith('base64,')) {
    return s.substring(7);
  }

  // Already raw base64
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: 'wa-product-image' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;

  if (action !== 'add') {
    return res.status(400).json({ error: 'Invalid action. Use ?action=add' });
  }

  try {
    const { productId, base64, filename } = req.body;

    if (!productId || !base64) {
      console.error('❌ Missing required fields:', { hasProductId: !!productId, hasBase64: !!base64 });
      return res.status(400).json({ error: 'Missing productId or image data' });
    }

    // Normalize productId (handle GID format)
    const normalizedProductId = normalizeShopifyProductId(productId);
    console.log(`📸 WA Image Upload: original=${productId}, normalized=${normalizedProductId}, filename=${filename}, base64Length=${base64.length}`);

    // Normalize base64 to raw format (Shopify REST API expects raw base64, not data URI)
    const wasDataUri = base64.startsWith('data:');
    const rawBase64 = stripDataUriPrefix(base64);
    console.log(`📸 Base64 format: ${wasDataUri ? 'data URI → stripped to raw' : 'raw base64 → kept as-is'}`);

    // Upload to Shopify
    const image = await addProductImage(normalizedProductId, rawBase64, filename);
    console.log(`📸 Initial upload response: imageId=${image?.id}, hasSrc=${!!image?.src}`);

    // If src is missing, poll Shopify to get the CDN URL (might take a few seconds to process)
    let imageUrl = image?.src || image?.url || image?.originalSrc || null;

    if (!imageUrl && image?.id) {
      console.log(`⏳ Image uploaded but no URL yet - polling Shopify for CDN URL...`);

      // Wait 1 second before first poll (Shopify usually ready by then)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Poll up to 3 times with 1-second delays (max 3 seconds total)
      // Keep total execution under 8 seconds to avoid Vercel timeout
      for (let attempt = 1; attempt <= 3; attempt++) {

        try {
          // Fetch product images to get the src field
          const { url, token } = {
            url: process.env.VITE_SHOPIFY_STORE_URL,
            token: process.env.VITE_SHOPIFY_ACCESS_TOKEN
          };

          const fetchRes = await fetch(
            `https://${url}/admin/api/2024-10/products/${normalizedProductId}/images/${image.id}.json`,
            {
              headers: { 'X-Shopify-Access-Token': token }
            }
          );

          if (fetchRes.ok) {
            const fetchData = await fetchRes.json();
            const fetchedImage = fetchData?.image;
            console.log(`🔍 Poll attempt ${attempt} response keys:`, Object.keys(fetchedImage || {}));
            console.log(`🔍 src=${fetchedImage?.src}, url=${fetchedImage?.url}`);

            imageUrl = fetchedImage?.src || fetchedImage?.url || null;

            if (imageUrl) {
              console.log(`✅ Got CDN URL on attempt ${attempt}: ${imageUrl}`);
              break;
            } else {
              console.log(`⏳ Attempt ${attempt}/3: Still no URL, retrying...`);
            }
          } else {
            console.log(`⚠️ Poll attempt ${attempt} HTTP ${fetchRes.status}: ${fetchRes.statusText}`);
          }
        } catch (pollError) {
          console.log(`⚠️ Poll attempt ${attempt} failed:`, pollError.message);
        }

        // Wait 1 second before next attempt (except after last attempt)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    console.log(`✅ WA Image uploaded: imageId=${image?.id}, imageUrl=${imageUrl}`);

    if (!imageUrl) {
      console.error('⚠️  Image uploaded but no URL after 3 polling attempts (5 seconds). Response keys:', Object.keys(image || {}));
      console.error('⚠️  Full image object:', JSON.stringify(image));
      console.error('⚠️  ProductId:', normalizedProductId, 'ImageId:', image?.id);
    }

    return res.status(200).json({
      success: true,
      imageId: image?.id,
      imageUrl,
      debug: {
        productId: normalizedProductId,
        filename,
        responseKeys: Object.keys(image || {}),
        hasUrl: !!imageUrl
      }
    });

  } catch (error) {
    console.error('❌ WA Image upload error:', error.message);
    console.error('❌ Stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload image',
      details: error.message
    });
  }
}
