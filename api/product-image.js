// api/product-image.js
// Manage product images - add and delete

import { addProductImage, deleteProductImage } from '../lib/shopify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;

  try {
    // ADD IMAGE
    if (action === 'add') {
      const { productId, base64, filename } = req.body;

      if (!productId || !base64) {
        return res.status(400).json({ error: 'Missing productId or image data' });
      }

      const image = await addProductImage(productId, base64, filename);

      return res.status(200).json({
        success: true,
        imageId: image?.id
      });
    }

    // DELETE IMAGE
    if (action === 'delete') {
      const { productId, imageId } = req.body;

      if (!productId || !imageId) {
        return res.status(400).json({ error: 'Missing productId or imageId' });
      }

      await deleteProductImage(productId, imageId);

      return res.status(200).json({
        success: true,
        message: 'Image deleted'
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=add or ?action=delete' });

  } catch (error) {
    console.error('Product image error:', error);
    return res.status(500).json({
      error: 'Failed to process image',
      details: error.message
    });
  }
}
