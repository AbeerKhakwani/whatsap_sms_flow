// lib/shopify.js
// Shared Shopify API helpers

const getConfig = () => ({
  url: process.env.VITE_SHOPIFY_STORE_URL,
  token: process.env.VITE_SHOPIFY_ACCESS_TOKEN
});

/**
 * Create a draft product in Shopify
 */
export async function createDraft({ designer, itemType, size, condition, askingPrice, color, material, description }) {
  const { url, token } = getConfig();

  const product = {
    product: {
      title: `${designer || 'Unknown Designer'} - ${itemType || 'Designer Item'}`,
      body_html: `<p>${description || ''}</p>
        <p><strong>Designer:</strong> ${designer || 'Unknown'}</p>
        <p><strong>Size:</strong> ${size || 'One Size'}</p>
        <p><strong>Condition:</strong> ${condition || 'Good'}</p>
        ${color ? `<p><strong>Color:</strong> ${color}</p>` : ''}
        ${material ? `<p><strong>Material:</strong> ${material}</p>` : ''}`,
      vendor: designer || 'Unknown Designer',
      product_type: 'Pakistani Designer Wear',
      tags: [designer, size, condition, color, 'preloved', 'pending-approval'].filter(Boolean).join(', '),
      options: [
        { name: 'Size', values: [size || 'One Size'] },
        { name: 'Brand', values: [designer || 'Unknown Designer'] },
        { name: 'Condition', values: [condition || 'Good'] }
      ],
      variants: [{
        option1: size || 'One Size',
        option2: designer || 'Unknown Designer',
        option3: condition || 'Good',
        price: (askingPrice || 0).toString(),
        inventory_management: 'shopify',
        inventory_quantity: 1
      }],
      status: 'draft'
    }
  };

  const response = await fetch(
    `https://${url}/admin/api/2024-10/products.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify(product)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Shopify createDraft error:', error);
    throw new Error('Failed to create Shopify draft');
  }

  const { product: created } = await response.json();
  console.log(`Created Shopify draft: ${created.id}`);
  return created;
}

/**
 * Get a product from Shopify
 */
export async function getProduct(productId) {
  const { url, token } = getConfig();

  const response = await fetch(
    `https://${url}/admin/api/2024-10/products/${productId}.json`,
    {
      headers: { 'X-Shopify-Access-Token': token }
    }
  );

  if (!response.ok) {
    throw new Error('Product not found in Shopify');
  }

  const { product } = await response.json();
  return product;
}

/**
 * Update a product in Shopify
 */
export async function updateProduct(productId, updates) {
  const { url, token } = getConfig();

  const response = await fetch(
    `https://${url}/admin/api/2024-10/products/${productId}.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ product: { id: productId, ...updates } })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify update error: ${error}`);
  }

  const { product } = await response.json();
  return product;
}

/**
 * Delete a product from Shopify
 */
export async function deleteProduct(productId) {
  const { url, token } = getConfig();

  const response = await fetch(
    `https://${url}/admin/api/2024-10/products/${productId}.json`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token }
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Shopify delete error: ${error}`);
  }

  console.log(`Deleted Shopify product: ${productId}`);
  return true;
}

/**
 * Add an image to a product
 */
export async function addProductImage(productId, base64, filename) {
  const { url, token } = getConfig();

  const response = await fetch(
    `https://${url}/admin/api/2024-10/products/${productId}/images.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({
        image: {
          attachment: base64,
          filename: filename || 'image.jpg'
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify image upload error: ${error}`);
  }

  const { image } = await response.json();
  return image;
}

/**
 * Get all draft products with pending-approval tag
 */
export async function getPendingDrafts() {
  const { url, token } = getConfig();

  const response = await fetch(
    `https://${url}/admin/api/2024-10/products.json?status=draft&limit=50`,
    {
      headers: { 'X-Shopify-Access-Token': token }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch from Shopify');
  }

  const { products } = await response.json();

  // Filter to only those with pending-approval tag
  return products.filter(p =>
    p.tags && p.tags.toLowerCase().includes('pending-approval')
  );
}

/**
 * Get product counts by status
 */
export async function getProductCounts() {
  const { url, token } = getConfig();

  const [draftRes, activeRes] = await Promise.all([
    fetch(`https://${url}/admin/api/2024-10/products/count.json?status=draft`, {
      headers: { 'X-Shopify-Access-Token': token }
    }),
    fetch(`https://${url}/admin/api/2024-10/products/count.json?status=active`, {
      headers: { 'X-Shopify-Access-Token': token }
    })
  ]);

  const { count: draftCount } = await draftRes.json();
  const { count: activeCount } = await activeRes.json();

  return { draft: draftCount, active: activeCount };
}

/**
 * Approve a draft - set status to active, remove pending-approval tag
 */
export async function approveDraft(productId) {
  const product = await getProduct(productId);

  // Remove pending-approval tag
  const currentTags = product.tags?.split(', ') || [];
  const newTags = currentTags
    .filter(tag => tag.toLowerCase() !== 'pending-approval')
    .join(', ');

  return updateProduct(productId, { status: 'active', tags: newTags });
}
