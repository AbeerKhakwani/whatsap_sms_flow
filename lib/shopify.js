// lib/shopify.js
// Shared Shopify API helpers

const getConfig = () => ({
  url: process.env.VITE_SHOPIFY_STORE_URL,
  token: process.env.VITE_SHOPIFY_ACCESS_TOKEN
});

// Pricing constants
const LISTING_FEE = 10; // $10 added to listing price
const DEFAULT_COMMISSION_RATE = 18; // 18% commission (seller gets 82%)

/**
 * Create a draft product in Shopify
 *
 * Pricing Model A:
 * - Seller asks: $100
 * - Listing price: $100 + $10 fee = $110
 * - Seller payout (cost): $100 × 82% = $82
 * - Commission stored as metafield: 18%
 */
export async function createDraft({ designer, itemType, size, condition, askingPrice, color, material, description, sellerEmail, sellerId, sellerPhone, commissionRate }) {
  const { url, token } = getConfig();

  // Use default commission unless specified
  const commission = commissionRate ?? DEFAULT_COMMISSION_RATE;

  // Calculate pricing
  const sellerAsk = parseFloat(askingPrice) || 0;
  const listingPrice = sellerAsk + LISTING_FEE; // Add $10 fee
  const sellerPayout = sellerAsk * ((100 - commission) / 100); // 82% of asking price

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
        price: listingPrice.toFixed(2),
        inventory_management: 'shopify',
        inventory_quantity: 1
      }],
      status: 'draft',
      metafields: [
        {
          namespace: 'seller',
          key: 'email',
          value: sellerEmail || '',
          type: 'single_line_text_field'
        },
        {
          namespace: 'seller',
          key: 'id',
          value: sellerId || '',
          type: 'single_line_text_field'
        },
        {
          namespace: 'seller',
          key: 'phone',
          value: sellerPhone || '',
          type: 'single_line_text_field'
        },
        {
          namespace: 'pricing',
          key: 'commission_rate',
          value: commission.toString(),
          type: 'number_integer'
        },
        {
          namespace: 'pricing',
          key: 'seller_asking_price',
          value: JSON.stringify({
            amount: sellerAsk.toFixed(2),
            currency_code: 'USD'
          }),
          type: 'money'
        },
        {
          namespace: 'pricing',
          key: 'seller_payout',
          value: JSON.stringify({
            amount: sellerPayout.toFixed(2),
            currency_code: 'USD'
          }),
          type: 'money'
        }
      ]
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

  // Update inventory item with cost (seller payout)
  const variant = created.variants?.[0];
  if (variant?.inventory_item_id) {
    await updateInventoryItemCost(variant.inventory_item_id, sellerPayout);
  }

  console.log(`Created Shopify draft: ${created.id} | Price: $${listingPrice} | Cost: $${sellerPayout} | Commission: ${commission}%`);
  return created;
}

/**
 * Update inventory item cost (seller payout)
 */
async function updateInventoryItemCost(inventoryItemId, cost) {
  const { url, token } = getConfig();

  const response = await fetch(
    `https://${url}/admin/api/2024-10/inventory_items/${inventoryItemId}.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({
        inventory_item: {
          id: inventoryItemId,
          cost: cost.toFixed(2)
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to set inventory cost:', error);
  }
}

/**
 * Get a product from Shopify (with metafields)
 */
export async function getProduct(productId, includeMetafields = true) {
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

  // Fetch metafields separately if needed
  if (includeMetafields) {
    const metafieldsRes = await fetch(
      `https://${url}/admin/api/2024-10/products/${productId}/metafields.json`,
      {
        headers: { 'X-Shopify-Access-Token': token }
      }
    );

    if (metafieldsRes.ok) {
      const { metafields } = await metafieldsRes.json();
      product.metafields = metafields;
    }
  }

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

  console.log(`📸 Shopify upload: productId=${productId}, filename=${filename}, base64 length=${base64?.length || 0}`);

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

  console.log(`📸 Shopify response: status=${response.status} ${response.statusText}`);

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Shopify image upload failed: ${error}`);
    throw new Error(`Shopify image upload error: ${error}`);
  }

  const { image } = await response.json();
  console.log(`✅ Shopify image uploaded: id=${image?.id}, src=${image?.src}`);
  return image;
}

/**
 * Delete an image from a product
 */
export async function deleteProductImage(productId, imageId) {
  const { url, token } = getConfig();

  const response = await fetch(
    `https://${url}/admin/api/2024-10/products/${productId}/images/${imageId}.json`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token }
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Shopify image delete error: ${error}`);
  }

  console.log(`Deleted image ${imageId} from product ${productId}`);
  return true;
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
 * Approve a draft - set status to active, add required tags, publish to Online Store
 */
export async function approveDraft(productId) {
  const product = await getProduct(productId);

  // Remove pending-approval tag and add New Arrivals
  const currentTags = product.tags?.split(', ') || [];
  let newTags = currentTags
    .filter(tag => tag.toLowerCase() !== 'pending-approval' && tag.toLowerCase() !== 'preloved')
    .filter(tag => tag.trim() !== '');

  // Add New Arrivals tag if not already present
  if (!newTags.some(tag => tag.toLowerCase() === 'new arrivals')) {
    newTags.unshift('New Arrivals');
  }

  // Detect and add gender tags based on product type/title
  const titleLower = product.title?.toLowerCase() || '';
  const typeLower = product.product_type?.toLowerCase() || '';
  const allText = `${titleLower} ${typeLower}`;

  const womenKeywords = ['suit', 'kurta', 'lawn', 'shalwar', 'dupatta', 'kameez', 'lehnga', 'gharara', 'saree', 'dress', 'kurti', 'women'];
  const menKeywords = ['sherwani', 'waistcoat', 'kurta shalwar', 'men'];

  const isWomen = womenKeywords.some(kw => allText.includes(kw));
  const isMen = menKeywords.some(kw => allText.includes(kw));

  if (isWomen && !newTags.some(tag => tag.toLowerCase() === 'women')) {
    newTags.push('Women');
  }
  if (isMen && !newTags.some(tag => tag.toLowerCase() === 'men')) {
    newTags.push('Men');
  }

  const tagsString = newTags.join(', ');

  return updateProduct(productId, { status: 'active', tags: tagsString });
}
