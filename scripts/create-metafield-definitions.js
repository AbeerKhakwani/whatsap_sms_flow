// scripts/create-metafield-definitions.js
// Creates structured metafield definitions for seller and pricing info

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
  console.error('❌ Missing env vars: VITE_SHOPIFY_STORE_URL or VITE_SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

console.log('🔧 Config:', {
  store: SHOPIFY_STORE_URL?.substring(0, 20) + '...',
  hasToken: !!SHOPIFY_ACCESS_TOKEN
});

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

  const result = await response.json();
  return result;
}

async function main() {
  console.log('🚀 Creating metafield definitions...\n');

  for (const def of METAFIELD_DEFINITIONS) {
    console.log(`Creating: ${def.namespace}.${def.key} (${def.type})`);

    try {
      const result = await createMetafieldDefinition(def);

      if (result.data?.metafieldDefinitionCreate?.createdDefinition) {
        const created = result.data.metafieldDefinitionCreate.createdDefinition;
        console.log(`✅ Created: ${created.namespace}.${created.key} (ID: ${created.id})`);
        if (def.pin) {
          console.log(`   📌 Pinned at position ${created.pinnedPosition || 'end'}`);
        }
      } else if (result.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
        const errors = result.data.metafieldDefinitionCreate.userErrors;

        // Check if it's "already exists" error
        const alreadyExists = errors.some(e =>
          e.code === 'TAKEN' ||
          e.message?.toLowerCase().includes('already') ||
          e.message?.toLowerCase().includes('taken')
        );

        if (alreadyExists) {
          console.log(`⚠️  Already exists: ${def.namespace}.${def.key}`);
        } else {
          console.error(`❌ Error creating ${def.namespace}.${def.key}:`, errors);
        }
      } else {
        console.error(`❌ Unexpected response:`, result);
      }
    } catch (error) {
      console.error(`❌ Exception creating ${def.namespace}.${def.key}:`, error.message);
    }

    console.log('');
  }

  console.log('✅ Done! Check your Shopify Admin → Settings → Custom data → Products');
}

main().catch(console.error);
