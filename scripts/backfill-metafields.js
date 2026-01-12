// scripts/backfill-metafields.js
// Migrates unstructured metafields to structured definitions

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try .env.prod first (production), then fall back to .env
const envFile = process.env.ENV_FILE || '.env.prod';
dotenv.config({ path: join(__dirname, '..', envFile) });

const SHOPIFY_STORE_URL = process.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const BATCH_SIZE = 50;
const DELAY_MS = 500; // Rate limiting

// Keys to migrate
const KEYS_TO_MIGRATE = [
  { namespace: 'seller', key: 'email', type: 'single_line_text_field' },
  { namespace: 'seller', key: 'phone', type: 'single_line_text_field' },
  { namespace: 'seller', key: 'id', type: 'single_line_text_field' },
  { namespace: 'pricing', key: 'commission_rate', type: 'number_integer' },
  { namespace: 'pricing', key: 'seller_asking_price', type: 'money' },
  { namespace: 'pricing', key: 'seller_payout', type: 'money' }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllProducts() {
  const products = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              legacyResourceId
              title
              metafields(first: 50) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify({
          query,
          variables: { first: BATCH_SIZE, after: cursor }
        })
      }
    );

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      break;
    }

    const data = result.data.products;
    products.push(...data.edges.map(e => e.node));

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;

    console.log(`Fetched ${products.length} products...`);
    await sleep(DELAY_MS);
  }

  return products;
}

async function updateProductMetafields(productId, metafields) {
  const mutation = `
    mutation UpdateProductMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: mutation,
        variables: { metafields }
      })
    }
  );

  const result = await response.json();
  return result;
}

function getMetafieldValue(metafields, namespace, key) {
  const field = metafields.find(m => m.namespace === namespace && m.key === key);
  return field?.value || null;
}

function hasStructuredField(metafields, namespace, key) {
  // Structured fields have a proper type like "single_line_text_field"
  // Unstructured are "json_string" or similar
  const field = metafields.find(m => m.namespace === namespace && m.key === key);
  if (!field) return false;

  // If type includes "json" it's unstructured
  return field.type && !field.type.toLowerCase().includes('json');
}

async function backfillProduct(product) {
  const metafields = product.metafields.edges.map(e => e.node);
  const updates = [];

  for (const keyDef of KEYS_TO_MIGRATE) {
    const { namespace, key, type } = keyDef;

    // Skip if structured field already exists
    if (hasStructuredField(metafields, namespace, key)) {
      continue;
    }

    // Get value from unstructured field
    const value = getMetafieldValue(metafields, namespace, key);
    if (!value) continue;

    // Format value based on type
    let formattedValue = value;
    if (type === 'money') {
      // Money type expects format: {"amount": "123.45", "currency_code": "USD"}
      const amount = parseFloat(value);
      if (isNaN(amount)) {
        console.log(`⚠️  Skipping ${namespace}.${key} for ${product.title} - invalid amount: ${value}`);
        continue;
      }
      formattedValue = JSON.stringify({
        amount: amount.toFixed(2),
        currency_code: 'USD'
      });
    } else if (type === 'number_integer') {
      // Ensure it's a valid integer
      const num = parseInt(value);
      if (isNaN(num)) {
        console.log(`⚠️  Skipping ${namespace}.${key} for ${product.title} - invalid number: ${value}`);
        continue;
      }
      formattedValue = num.toString();
    }

    updates.push({
      ownerId: product.id,
      namespace,
      key,
      value: formattedValue,
      type
    });
  }

  if (updates.length === 0) {
    return { updated: false, count: 0 };
  }

  try {
    const result = await updateProductMetafields(product.id, updates);

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error(`❌ Errors updating ${product.title}:`, result.data.metafieldsSet.userErrors);
      return { updated: false, count: 0 };
    }

    return { updated: true, count: updates.length };
  } catch (error) {
    console.error(`❌ Exception updating ${product.title}:`, error.message);
    return { updated: false, count: 0 };
  }
}

async function main() {
  console.log('🚀 Starting metafield backfill...\n');

  // Fetch all products
  console.log('📦 Fetching all products...');
  const products = await getAllProducts();
  console.log(`✅ Found ${products.length} products\n`);

  let processedCount = 0;
  let updatedCount = 0;
  let totalFieldsUpdated = 0;

  for (const product of products) {
    processedCount++;

    const result = await backfillProduct(product);

    if (result.updated) {
      updatedCount++;
      totalFieldsUpdated += result.count;
      console.log(`✅ [${processedCount}/${products.length}] ${product.title} - Updated ${result.count} fields`);
    } else {
      console.log(`⏭️  [${processedCount}/${products.length}] ${product.title} - No changes needed`);
    }

    // Rate limiting
    await sleep(DELAY_MS);
  }

  console.log('\n📊 Summary:');
  console.log(`   Total products: ${products.length}`);
  console.log(`   Products updated: ${updatedCount}`);
  console.log(`   Total fields migrated: ${totalFieldsUpdated}`);
  console.log('\n✅ Backfill complete!');
}

main().catch(console.error);
