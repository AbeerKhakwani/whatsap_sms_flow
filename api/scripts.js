// api/scripts.js
// Admin scripts runner for metafield migration

const SHOPIFY_STORE_URL = process.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

const METAFIELD_DEFINITIONS = [
  {
    name: 'Seller Email',
    namespace: 'seller',
    key: 'email',
    type: 'single_line_text_field',
    description: 'Email address of the seller',
    ownerType: 'PRODUCT',
    pin: true
  },
  {
    name: 'Seller Phone',
    namespace: 'seller',
    key: 'phone',
    type: 'single_line_text_field',
    description: 'Phone number of the seller',
    ownerType: 'PRODUCT',
    pin: true
  },
  {
    name: 'Seller ID',
    namespace: 'seller',
    key: 'id',
    type: 'single_line_text_field',
    description: 'Seller UUID from database',
    ownerType: 'PRODUCT',
    pin: false
  },
  {
    name: 'Commission Rate',
    namespace: 'pricing',
    key: 'commission_rate',
    type: 'number_integer',
    description: 'Commission percentage (e.g., 18 for 18%)',
    ownerType: 'PRODUCT',
    pin: true
  },
  {
    name: 'Seller Asking Price',
    namespace: 'pricing',
    key: 'seller_asking_price',
    type: 'money',
    description: 'Amount seller originally asked for',
    ownerType: 'PRODUCT',
    pin: true
  },
  {
    name: 'Seller Payout',
    namespace: 'pricing',
    key: 'seller_payout',
    type: 'money',
    description: 'Amount seller will receive after commission',
    ownerType: 'PRODUCT',
    pin: true
  }
];

const KEYS_TO_MIGRATE = [
  { namespace: 'seller', key: 'email', type: 'single_line_text_field' },
  { namespace: 'seller', key: 'phone', type: 'single_line_text_field' },
  { namespace: 'seller', key: 'id', type: 'single_line_text_field' },
  { namespace: 'pricing', key: 'commission_rate', type: 'number_integer' },
  { namespace: 'pricing', key: 'seller_asking_price', type: 'money' },
  { namespace: 'pricing', key: 'seller_payout', type: 'money' }
];

async function createMetafieldDefinition(definition) {
  const mutation = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          namespace
          key
          type {
            name
          }
          pinnedPosition
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    definition: {
      name: definition.name,
      namespace: definition.namespace,
      key: definition.key,
      type: definition.type,
      description: definition.description,
      ownerType: definition.ownerType,
      pin: definition.pin
    }
  };

  const response = await fetch(
    `https://${SHOPIFY_STORE_URL}/admin/api/2024-10/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({ query: mutation, variables })
    }
  );

  return await response.json();
}

async function getAllProducts() {
  const products = [];
  let hasNextPage = true;
  let cursor = null;
  const BATCH_SIZE = 50;

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
      throw new Error(result.errors[0].message);
    }

    const data = result.data.products;
    products.push(...data.edges.map(e => e.node));

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
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

  return await response.json();
}

function getMetafieldValue(metafields, namespace, key) {
  const field = metafields.find(m => m.namespace === namespace && m.key === key);
  return field?.value || null;
}

function hasStructuredField(metafields, namespace, key) {
  const field = metafields.find(m => m.namespace === namespace && m.key === key);
  if (!field) return false;
  return field.type && !field.type.toLowerCase().includes('json');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;

  try {
    // CREATE METAFIELD DEFINITIONS
    if (action === 'create-definitions') {
      const output = [];
      let successCount = 0;
      let alreadyExistsCount = 0;
      let errorCount = 0;

      output.push('🚀 Creating metafield definitions...\n');

      for (const def of METAFIELD_DEFINITIONS) {
        output.push(`Creating: ${def.namespace}.${def.key} (${def.type})`);

        const result = await createMetafieldDefinition(def);

        if (result.data?.metafieldDefinitionCreate?.createdDefinition) {
          const created = result.data.metafieldDefinitionCreate.createdDefinition;
          output.push(`✅ Created: ${created.namespace}.${created.key} (ID: ${created.id})`);
          if (def.pin) {
            output.push(`   📌 Pinned at position ${created.pinnedPosition || 'end'}`);
          }
          successCount++;
        } else if (result.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
          const errors = result.data.metafieldDefinitionCreate.userErrors;
          const alreadyExists = errors.some(e =>
            e.code === 'TAKEN' ||
            e.message?.toLowerCase().includes('already') ||
            e.message?.toLowerCase().includes('taken')
          );

          if (alreadyExists) {
            output.push(`⚠️  Already exists: ${def.namespace}.${def.key}`);
            alreadyExistsCount++;
          } else {
            output.push(`❌ Error: ${errors[0].message}`);
            errorCount++;
          }
        }

        output.push('');
      }

      output.push('✅ Done! Check Shopify Admin → Settings → Custom data → Products');

      return res.status(200).json({
        success: true,
        output,
        summary: {
          'Created': successCount,
          'Already existed': alreadyExistsCount,
          'Errors': errorCount,
          'Total': METAFIELD_DEFINITIONS.length
        }
      });
    }

    // BACKFILL METAFIELDS
    if (action === 'backfill-metafields') {
      const output = [];

      output.push('🚀 Starting metafield backfill...\n');
      output.push('📦 Fetching all products...');

      const products = await getAllProducts();
      output.push(`✅ Found ${products.length} products\n`);

      let processedCount = 0;
      let updatedCount = 0;
      let totalFieldsUpdated = 0;

      for (const product of products) {
        processedCount++;
        const metafields = product.metafields.edges.map(e => e.node);
        const updates = [];

        for (const keyDef of KEYS_TO_MIGRATE) {
          const { namespace, key, type } = keyDef;

          if (hasStructuredField(metafields, namespace, key)) {
            continue;
          }

          const value = getMetafieldValue(metafields, namespace, key);
          if (!value) continue;

          let formattedValue = value;
          if (type === 'money') {
            const amount = parseFloat(value);
            if (isNaN(amount)) {
              output.push(`⚠️  Skipping ${namespace}.${key} for ${product.title} - invalid amount`);
              continue;
            }
            formattedValue = JSON.stringify({
              amount: amount.toFixed(2),
              currency_code: 'USD'
            });
          } else if (type === 'number_integer') {
            const num = parseInt(value);
            if (isNaN(num)) {
              output.push(`⚠️  Skipping ${namespace}.${key} for ${product.title} - invalid number`);
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

        if (updates.length > 0) {
          const result = await updateProductMetafields(product.id, updates);

          if (result.data?.metafieldsSet?.userErrors?.length > 0) {
            output.push(`❌ Error updating ${product.title}: ${result.data.metafieldsSet.userErrors[0].message}`);
          } else {
            updatedCount++;
            totalFieldsUpdated += updates.length;
            output.push(`✅ [${processedCount}/${products.length}] ${product.title} - Updated ${updates.length} fields`);
          }
        } else {
          output.push(`⏭️  [${processedCount}/${products.length}] ${product.title} - No changes needed`);
        }

        // Add small delay every 10 products to avoid rate limits
        if (processedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      output.push('\n📊 Summary:');
      output.push('✅ Backfill complete!');

      return res.status(200).json({
        success: true,
        output,
        summary: {
          'Total products': products.length,
          'Products updated': updatedCount,
          'Total fields migrated': totalFieldsUpdated
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Script error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      output: [`❌ Error: ${error.message}`]
    });
  }
}
