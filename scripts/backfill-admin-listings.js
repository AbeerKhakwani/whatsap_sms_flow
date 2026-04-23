// scripts/backfill-admin-listings.js
// One-off: backfill seller.shopify_product_ids for admin-created listings.
//
// Admin-create (api/admin-listings.js action=create) previously inserted into
// the `listings` table but never pushed the product ID into the seller's
// `shopify_product_ids` array — so those products never appeared in the seller
// dashboard (api/seller.js reads from that array).
//
// This script finds every listings row whose shopify_product_id is missing
// from its seller's array and adds it.
//
// Usage:
//   node scripts/backfill-admin-listings.js            # dry run (default)
//   node scripts/backfill-admin-listings.js --apply    # actually write

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFile = process.env.ENV_FILE || '.env.prod';
dotenv.config({ path: join(__dirname, '..', envFile) });
// Fall back to .env if .env.prod is missing values
dotenv.config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log(APPLY ? 'APPLY mode — will write' : 'DRY RUN — no writes (pass --apply to commit)');
  console.log('');

  const { data: listings, error: lErr } = await supabase
    .from('listings')
    .select('id, seller_id, shopify_product_id, status, created_at')
    .not('shopify_product_id', 'is', null);

  if (lErr) {
    console.error('Failed to read listings:', lErr);
    process.exit(1);
  }

  const sellerIds = [...new Set(listings.map(l => l.seller_id).filter(Boolean))];

  const { data: sellers, error: sErr } = await supabase
    .from('sellers')
    .select('id, email, name, shopify_product_ids')
    .in('id', sellerIds);

  if (sErr) {
    console.error('Failed to read sellers:', sErr);
    process.exit(1);
  }

  const sellerById = new Map(sellers.map(s => [s.id, s]));
  const additionsBySeller = new Map(); // seller_id -> Set of product IDs to add

  for (const l of listings) {
    const seller = sellerById.get(l.seller_id);
    if (!seller) continue;

    const current = seller.shopify_product_ids || [];
    const pid = String(l.shopify_product_id);

    if (current.includes(pid)) continue;

    if (!additionsBySeller.has(seller.id)) {
      additionsBySeller.set(seller.id, new Set());
    }
    additionsBySeller.get(seller.id).add(pid);
  }

  let totalMissing = 0;
  for (const [sellerId, ids] of additionsBySeller) {
    const seller = sellerById.get(sellerId);
    totalMissing += ids.size;
    console.log(`  ${seller.email}  (+${ids.size})  [${[...ids].join(', ')}]`);
  }

  console.log('');
  console.log(`Sellers needing backfill: ${additionsBySeller.size}`);
  console.log(`Total product IDs to add: ${totalMissing}`);

  if (!APPLY) {
    console.log('');
    console.log('Dry run complete. Re-run with --apply to write.');
    return;
  }

  console.log('');
  console.log('Writing...');

  let ok = 0;
  let fail = 0;
  for (const [sellerId, ids] of additionsBySeller) {
    const seller = sellerById.get(sellerId);
    const merged = [...new Set([...(seller.shopify_product_ids || []), ...ids])];

    const { error } = await supabase
      .from('sellers')
      .update({ shopify_product_ids: merged })
      .eq('id', sellerId);

    if (error) {
      console.error(`  FAIL ${seller.email}: ${error.message}`);
      fail++;
    } else {
      ok++;
    }
  }

  console.log('');
  console.log(`Done. Updated ${ok} sellers, ${fail} failed.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
