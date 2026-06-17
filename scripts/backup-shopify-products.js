// scripts/backup-shopify-products.js
// Phase 0 of ownership refactor: export all Shopify products + seller metafields to JSON.
//
// This is a safety snapshot before any data migration. The output file can be used
// to restore metafields if anything goes wrong during the refactor.
//
// Usage:
//   node scripts/backup-shopify-products.js
//   node scripts/backup-shopify-products.js --output ./backups/products-2026-05-29.json

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.prod') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_URL || !SHOPIFY_TOKEN) {
  console.error('Missing SHOPIFY_SHOP (or VITE_SHOPIFY_STORE_URL) and/or SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

const outputArg = process.argv.find(a => a.startsWith('--output=') || a === '--output');
let outputPath;
if (outputArg === '--output') {
  outputPath = process.argv[process.argv.indexOf('--output') + 1];
} else if (outputArg?.startsWith('--output=')) {
  outputPath = outputArg.split('=')[1];
} else {
  const date = new Date().toISOString().split('T')[0];
  mkdirSync(join(__dirname, '..', 'backups'), { recursive: true });
  outputPath = join(__dirname, '..', 'backups', `shopify-products-${date}.json`);
}

async function fetchPage(pageInfo = null) {
  const params = new URLSearchParams({ limit: '250' });
  if (pageInfo) params.set('page_info', pageInfo);

  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products.json?${params}`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );

  if (!res.ok) {
    throw new Error(`Shopify products API error: ${res.status} ${await res.text()}`);
  }

  const linkHeader = res.headers.get('link') || '';
  const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  const nextPageInfo = nextMatch ? nextMatch[1] : null;

  const body = await res.json();
  return { products: body.products, nextPageInfo };
}

async function fetchMetafields(productId, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(
      `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    );

    if (res.ok) {
      const body = await res.json();
      return body.metafields || [];
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
      const wait = (retryAfter + 1) * 1000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    console.warn(`  Warning: failed to fetch metafields for product ${productId}: ${res.status}`);
    return [];
  }

  console.warn(`  Warning: gave up on product ${productId} after ${retries} retries`);
  return [];
}

async function main() {
  console.log('Phirstory — Shopify product backup');
  console.log(`Output: ${outputPath}`);
  console.log('');

  // Fetch all products (paginated)
  const allProducts = [];
  let pageInfo = null;
  let page = 1;

  do {
    process.stdout.write(`Fetching products page ${page}...`);
    const { products, nextPageInfo } = await fetchPage(pageInfo);
    allProducts.push(...products);
    process.stdout.write(` ${products.length} products (total: ${allProducts.length})\n`);
    pageInfo = nextPageInfo;
    page++;
  } while (pageInfo);

  console.log('');
  console.log(`Fetching metafields for ${allProducts.length} products...`);

  // Fetch metafields for every product, with a small delay to avoid rate limits
  const enriched = [];
  for (let i = 0; i < allProducts.length; i++) {
    const product = allProducts[i];
    if (i > 0 && i % 10 === 0) {
      process.stdout.write(`  ${i}/${allProducts.length}...\n`);
    }
    // ~1 req/sec to stay safely within Shopify's 2 req/sec REST limit
    await new Promise(r => setTimeout(r, 1000));

    const metafields = await fetchMetafields(product.id);
    const sellerMeta = metafields.filter(m => m.namespace === 'seller');
    const pricingMeta = metafields.filter(m => m.namespace === 'pricing');

    enriched.push({
      id: product.id,
      title: product.title,
      status: product.status,
      created_at: product.created_at,
      updated_at: product.updated_at,
      variants: product.variants?.map(v => ({
        id: v.id,
        price: v.price,
        sku: v.sku,
      })),
      seller_metafields: sellerMeta,
      pricing_metafields: pricingMeta,
      all_metafields: metafields,
    });
  }

  const backup = {
    exported_at: new Date().toISOString(),
    product_count: enriched.length,
    products: enriched,
  };

  writeFileSync(outputPath, JSON.stringify(backup, null, 2));

  // Summary
  const withSeller = enriched.filter(p => p.seller_metafields.length > 0).length;
  const withoutSeller = enriched.length - withSeller;

  console.log('');
  console.log('--- Backup complete ---');
  console.log(`Total products:        ${enriched.length}`);
  console.log(`With seller metafield: ${withSeller}`);
  console.log(`Without seller (admin-owned or unassigned): ${withoutSeller}`);
  console.log(`Output: ${outputPath}`);
}

main().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
