// lib/shopify.js
// Shared Shopify API helpers

const getConfig = () => ({
  url: process.env.VITE_SHOPIFY_STORE_URL,
  token: process.env.VITE_SHOPIFY_ACCESS_TOKEN
});

// Pricing constants
const LISTING_FEE = 10; // $10 added to listing price
const DEFAULT_COMMISSION_RATE = 18; // 18% commission (seller gets 82%)

// Cache metafield definitions so we only fetch once per cold start
let _metafieldDefsCache = null;

/**
 * Fetch product metafield definitions from Shopify to get correct types
 */
async function getMetafieldDefinitions() {
  if (_metafieldDefsCache) return _metafieldDefsCache;
  const { url, token } = getConfig();
  try {
    const res = await fetch(
      `https://${url}/admin/api/2024-10/metafield_definitions.json?owner_resource=product&limit=100`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    if (res.ok) {
      const body = await res.json();
      const defs = body.metafield_definitions || [];
      console.log(`Fetched ${defs.length} metafield definitions`);
      const map = {};
      for (const def of defs) {
        // type can be string or { name: "...", category: "..." }
        const typeName = typeof def.type === 'string' ? def.type : def.type?.name;
        map[`${def.namespace}.${def.key}`] = typeName;
        console.log(`  ${def.namespace}.${def.key} → ${typeName}`);
      }
      _metafieldDefsCache = map;
      return map;
    } else {
      console.error('Metafield definitions API error:', res.status, await res.text());
    }
  } catch (e) {
    console.error('Failed to fetch metafield definitions:', e.message);
  }
  return {};
}

/**
 * Build a metafield with the correct type from Shopify definitions
 * Falls back to the provided default type if no definition exists
 */
function buildMetafield(defs, namespace, key, value, defaultType) {
  const defType = defs[`${namespace}.${key}`] || defaultType;
  // If definition says number_integer but we're passing money JSON, convert
  if (defType === 'number_integer' && typeof value === 'string' && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      value = Math.round(parseFloat(parsed.amount || 0)).toString();
    } catch { /* use as-is */ }
  }
  // If definition says number_integer but value is a money string, extract amount
  if (defType === 'number_integer' && typeof value === 'string' && !value.startsWith('{')) {
    value = Math.round(parseFloat(value) || 0).toString();
  }
  console.log(`  metafield ${namespace}.${key}: type=${defType} (def=${defs[`${namespace}.${key}`] || 'none'}, default=${defaultType})`);
  return { namespace, key, value, type: defType };
}

/**
 * Create a draft product in Shopify
 *
 * Pricing Model A:
 * - Seller asks: $100
 * - Listing price: $100 + $10 fee = $110
 * - Seller payout (cost): $100 × 82% = $82
 * - Commission stored as metafield: 18%
 */
export async function createDraft({ designer, itemType, size, condition, askingPrice, color, material, description, sellerEmail, sellerId, sellerPhone, commissionRate, chest, hip, notes, originalPrice }) {
  const { url, token } = getConfig();

  // Use default commission unless specified
  const commission = commissionRate ?? DEFAULT_COMMISSION_RATE;

  // Calculate pricing
  const sellerAsk = parseFloat(askingPrice) || 0;
  const listingPrice = sellerAsk + LISTING_FEE; // Add $10 fee
  const sellerPayout = sellerAsk * ((100 - commission) / 100); // 82% of asking price
  const retailPrice = parseFloat(originalPrice) || 0;

  // Build measurements string from chest/hip
  const measurementParts = [];
  if (chest) measurementParts.push(`Chest: ${chest}"`);
  if (hip) measurementParts.push(`Hip: ${hip}"`);
  const measurements = measurementParts.join(' | ');

  // Fetch actual metafield definitions from Shopify to avoid type mismatches
  const defs = await getMetafieldDefinitions();

  // Build metafields with correct types per namespace:
  // - pricing.* fields → money type (JSON {amount, currency_code})
  // - custom.* price fields → number_integer (plain integer string)
  // - custom.* text fields → multi_line_text_field
  const metafields = [
    buildMetafield(defs, 'seller', 'email', sellerEmail || '', 'single_line_text_field'),
    buildMetafield(defs, 'seller', 'id', sellerId || '', 'single_line_text_field'),
    buildMetafield(defs, 'seller', 'phone', sellerPhone || '', 'single_line_text_field'),
    buildMetafield(defs, 'pricing', 'commission_rate', commission.toString(), 'number_integer'),
    buildMetafield(defs, 'pricing', 'seller_asking_price', JSON.stringify({ amount: sellerAsk.toFixed(2), currency_code: 'USD' }), 'money'),
    buildMetafield(defs, 'pricing', 'seller_payout', JSON.stringify({ amount: sellerPayout.toFixed(2), currency_code: 'USD' }), 'money'),
  ];

  if (measurements) {
    metafields.push(buildMetafield(defs, 'custom', 'measurements', measurements, 'multi_line_text_field'));
  }
  if (material) {
    metafields.push(buildMetafield(defs, 'custom', 'material', material, 'multi_line_text_field'));
  }
  if (condition) {
    metafields.push(buildMetafield(defs, 'custom', 'condition', condition, 'multi_line_text_field'));
  }
  if (notes || description) {
    metafields.push(buildMetafield(defs, 'custom', 'seller_description', notes || description || '', 'multi_line_text_field'));
  }
  if (retailPrice > 0) {
    metafields.push(buildMetafield(defs, 'custom', 'estimated_retail_price', Math.round(retailPrice).toString(), 'number_integer'));
    const savings = retailPrice - listingPrice;
    if (savings > 0) {
      metafields.push(buildMetafield(defs, 'custom', 'your_savings', Math.round(savings).toString(), 'number_integer'));
    }
  }

  // Build options and variant (Shopify max 3 options)
  const options = [
    { name: 'Size', values: [size || 'One Size'] },
    { name: 'Color', values: [color || 'Not specified'] },
    { name: 'Condition', values: [condition || 'Good'] }
  ];
  const variant = {
    option1: size || 'One Size',
    option2: color || 'Not specified',
    option3: condition || 'Good',
    price: listingPrice.toFixed(2),
    inventory_management: 'shopify',
    inventory_quantity: 1
  };

  const product = {
    product: {
      title: `${designer || 'Unknown Designer'} - ${itemType || 'Designer Item'}`,
      body_html: `<p>${description || ''}</p>`,
      vendor: designer || 'Unknown Designer',
      product_type: 'Pakistani Designer Wear',
      tags: [designer, size, condition, color, material, 'preloved', 'pending-approval'].filter(Boolean).join(', '),
      options,
      variants: [variant],
      status: 'draft',
      metafields
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
    console.error('Shopify createDraft error:', response.status, error);
    throw new Error(`Failed to create Shopify draft: ${response.status} - ${error}`);
  }

  const { product: created } = await response.json();

  // Update inventory item with cost (seller payout)
  const createdVariant = created.variants?.[0];
  if (createdVariant?.inventory_item_id) {
    await updateInventoryItemCost(createdVariant.inventory_item_id, sellerPayout);
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
 * Fulfill a Shopify order with tracking information
 * This triggers Shopify's automatic shipping notification emails to the buyer
 */
export async function fulfillOrder(orderId, tracking) {
  const { url, token } = getConfig();

  console.log(`📦 Fulfilling Shopify order: ${orderId} with tracking: ${tracking.tracking_number}`);

  try {
    // Step 1: Get the order's fulfillment orders
    const fulfillmentOrdersRes = await fetch(
      `https://${url}/admin/api/2024-10/orders/${orderId}/fulfillment_orders.json`,
      {
        headers: { 'X-Shopify-Access-Token': token }
      }
    );

    if (!fulfillmentOrdersRes.ok) {
      const error = await fulfillmentOrdersRes.text();
      console.error('Failed to get fulfillment orders:', error);
      throw new Error('Failed to get fulfillment orders');
    }

    const { fulfillment_orders } = await fulfillmentOrdersRes.json();

    // Find the open fulfillment order
    const openFulfillmentOrder = fulfillment_orders?.find(
      fo => fo.status === 'open' || fo.status === 'in_progress'
    );

    if (!openFulfillmentOrder) {
      console.log('No open fulfillment order found - order may already be fulfilled');
      return { success: true, alreadyFulfilled: true };
    }

    // Step 2: Create fulfillment with tracking
    const fulfillmentPayload = {
      fulfillment: {
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: openFulfillmentOrder.id
          }
        ],
        tracking_info: {
          number: tracking.tracking_number,
          company: tracking.carrier || 'USPS',
          url: tracking.tracking_url || `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking.tracking_number}`
        },
        notify_customer: true
      }
    };

    const fulfillRes = await fetch(
      `https://${url}/admin/api/2024-10/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token
        },
        body: JSON.stringify(fulfillmentPayload)
      }
    );

    if (!fulfillRes.ok) {
      const error = await fulfillRes.text();
      console.error('Failed to create fulfillment:', error);
      throw new Error(`Failed to fulfill order: ${error}`);
    }

    const { fulfillment } = await fulfillRes.json();
    console.log(`✅ Order ${orderId} fulfilled. Buyer will receive tracking notification.`);

    return {
      success: true,
      fulfillmentId: fulfillment.id,
      trackingNumber: tracking.tracking_number,
      carrier: tracking.carrier
    };

  } catch (err) {
    console.error('Fulfillment error:', err.message);
    throw err;
  }
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
