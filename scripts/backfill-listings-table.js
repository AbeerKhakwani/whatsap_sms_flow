// scripts/backfill-listings-table.js
//
// Phase 1 of ownership refactor: populate the listings table from Shopify metafields.
//
// WHY: The listings table is currently partial — some rows are missing or have wrong seller_id.
// Shopify metafields are the authoritative source of truth (seller.email + seller.id).
// This script reads every product's metafields and upserts a listings row so the table
// is fully in sync before we switch readers off the shopify_product_ids array (Phase 4).
//
// SAFE TO RUN MULTIPLE TIMES — uses upsert on shopify_product_id, never deletes anything.
//
// Usage:
//   node scripts/backfill-listings-table.js           # dry run (no writes)
//   node scripts/backfill-listings-table.js --apply   # actually write to Supabase

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.prod') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const SHOPIFY_URL = (process.env.SHOPIFY_SHOP || process.env.VITE_SHOPIFY_STORE_URL || '').trim().replace(/\\n/g, '');
const SHOPIFY_TOKEN = (process.env.SHOPIFY_ACCESS_TOKEN || process.env.VITE_SHOPIFY_ACCESS_TOKEN || '').trim().replace(/\\n/g, '');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SHOPIFY_URL || !SHOPIFY_TOKEN) {
  console.error('Missing SHOPIFY env vars');
  process.exit(1);
}
if (APPLY && !SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_KEY — needed for --apply mode');
  process.exit(1);
}

const supabase = APPLY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

console.log(`\n🔍 Backfill listings table — ${APPLY ? '✍️  APPLY mode (writing to Supabase)' : '🧪 DRY RUN (no writes)'}\n`);

// ─── Shopify helpers ──────────────────────────────────────────────────────────

async function fetchPage(pageInfo = null) {
  const params = new URLSearchParams({ limit: '250' });
  if (pageInfo) params.set('page_info', pageInfo);

  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products.json?${params}`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  if (!res.ok) throw new Error(`Shopify error: ${res.status} ${await res.text()}`);

  const linkHeader = res.headers.get('link') || '';
  const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return {
    products: (await res.json()).products,
    nextPageInfo: nextMatch ? nextMatch[1] : null,
  };
}

async function fetchMetafields(productId, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(
      `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    );
    if (res.ok) return (await res.json()).metafields || [];
    if (res.status === 429) {
      const wait = (parseInt(res.headers.get('retry-after') || '2', 10) + 1) * 1000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return [];
  }
  return [];
}

function getMeta(metafields, namespace, key) {
  return metafields.find(m => m.namespace === namespace && m.key === key)?.value ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load all sellers from Supabase (or just email→id mapping from Shopify metafields)
  //    We need seller_id for the listings row. Build a map of email → seller row.
  let sellerMap = {}; // email → { id }

  if (APPLY) {
    const { data: sellers } = await supabase.from('sellers').select('id, email');
    for (const s of sellers || []) {
      if (s.email) sellerMap[s.email.toLowerCase()] = s;
    }
    console.log(`Loaded ${Object.keys(sellerMap).length} sellers from Supabase\n`);
  }

  // 2. Walk all Shopify products
  let pageInfo = null;
  let totalProducts = 0;
  let withOwner = 0;
  let noOwner = 0;
  let sellerNotFound = 0;
  const toUpsert = [];

  do {
    const { products, nextPageInfo } = await fetchPage(pageInfo);
    pageInfo = nextPageInfo;
    totalProducts += products.length;

    for (const product of products) {
      const metafields = await fetchMetafields(product.id);
      const sellerEmail = getMeta(metafields, 'seller', 'email');
      const sellerIdMeta = getMeta(metafields, 'seller', 'id');

      if (!sellerEmail) {
        noOwner++;
        console.log(`  ⚠️  No seller email: ${product.id} — ${product.title}`);
        continue;
      }

      withOwner++;
      const emailKey = sellerEmail.toLowerCase();

      // In dry-run mode we just report what we'd write
      if (!APPLY) {
        console.log(`  ✓ ${product.id} → ${sellerEmail} (${product.title.slice(0, 40)})`);
        toUpsert.push({ shopify_product_id: product.id.toString(), seller_email: sellerEmail });
        continue;
      }

      // In apply mode, look up seller_id from our map
      const seller = sellerMap[emailKey];
      if (!seller) {
        sellerNotFound++;
        console.log(`  ❌ Seller not in Supabase: ${sellerEmail} (product ${product.id})`);
        continue;
      }

      toUpsert.push({
        seller_id: seller.id,
        shopify_product_id: product.id.toString(),
        status: 'listed',
        updated_at: new Date().toISOString(),
      });
    }

    process.stdout.write(`  Fetched ${totalProducts} products so far...\r`);
  } while (pageInfo);

  console.log(`\n\n── Summary ──────────────────────────────────`);
  console.log(`Total products:       ${totalProducts}`);
  console.log(`With seller email:    ${withOwner}`);
  console.log(`No seller email:      ${noOwner}`);
  if (APPLY) console.log(`Seller not in DB:     ${sellerNotFound}`);
  console.log(`Would upsert:         ${toUpsert.length}`);

  if (!APPLY) {
    console.log(`\n✅ Dry run complete. Run with --apply to write to Supabase.\n`);
    return;
  }

  // 3. Batch upsert into listings table (chunks of 100 to stay under Supabase limits)
  console.log(`\nWriting to Supabase...`);
  const CHUNK = 100;
  let upserted = 0;
  for (let i = 0; i < toUpsert.length; i += CHUNK) {
    const chunk = toUpsert.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('listings')
      .upsert(chunk, { onConflict: 'shopify_product_id' });

    if (error) {
      console.error(`  ❌ Upsert error on chunk ${i}–${i + CHUNK}:`, error.message);
    } else {
      upserted += chunk.length;
      process.stdout.write(`  Upserted ${upserted}/${toUpsert.length}...\r`);
    }
  }

  console.log(`\n\n✅ Done. Upserted ${upserted} listings rows.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
