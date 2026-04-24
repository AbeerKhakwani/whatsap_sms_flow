// api/product-image.js
// Manage product images - add and delete

import { addProductImage, addProductImageFromUrl, deleteProductImage } from '../lib/shopify.js';
import { cors } from '../lib/cors.js';
import { logImpersonationEvent } from '../lib/audit-log.js';

export default async function handler(req, res) {
  if (cors(req, res, 'POST, DELETE, OPTIONS')) return;

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;

  try {
    // ADD IMAGE (accepts base64 or imageUrl)
    if (action === 'add') {
      const { productId, base64, imageUrl, filename } = req.body;

      if (!productId || (!base64 && !imageUrl)) {
        return res.status(400).json({ error: 'Missing productId or image data (base64 or imageUrl)' });
      }

      logImpersonationEvent(req, { action: 'photo.add', targetId: productId, payload: { filename } });

      let image;
      if (imageUrl) {
        // Let Shopify download the image directly from URL
        image = await addProductImageFromUrl(productId, imageUrl, filename);
      } else {
        image = await addProductImage(productId, base64, filename);
      }

      return res.status(200).json({
        success: true,
        imageId: image?.id,
        imageUrl: image?.src
      });
    }

    // DELETE IMAGE
    if (action === 'delete') {
      const { productId, imageId } = req.body;

      if (!productId || !imageId) {
        return res.status(400).json({ error: 'Missing productId or imageId' });
      }

      logImpersonationEvent(req, { action: 'photo.delete', targetId: productId, payload: { imageId } });

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
