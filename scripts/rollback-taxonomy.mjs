// scripts/rollback-taxonomy.mjs
// Restore products to a pre-migration snapshot taken by migrate-taxonomy.mjs.
// Dry-run by default. Restores each product's category + Size option (name + linkedMetafield +
// each value's name/linkedMetafieldValue) exactly as captured.
//
// Usage:
//   node scripts/rollback-taxonomy.mjs --from=backups/shopify-taxonomy-snapshot-<...>.json            # dry-run
//   node scripts/rollback-taxonomy.mjs --from=<snapshot> --apply --limit=1                            # restore 1 (the test)
//   node scripts/rollback-taxonomy.mjs --from=<snapshot> --apply                                      # full restore

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod') });

const TOKEN = process.env.SHOPIFY_MIGRATION_TOKEN;
const API = 'https://ba42c1.myshopify.com/admin/api/2024-10/graphql.json';
const APPLY = process.argv.includes('--apply');
const fromArg = process.argv.find(a => a.startsWith('--from='));
const limArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;
if (!TOKEN) { console.error('Missing SHOPIFY_MIGRATION_TOKEN in .env.prod'); process.exit(1); }
if (!fromArg) { console.error('Required: --from=backups/shopify-taxonomy-snapshot-<...>.json'); process.exit(1); }

async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 220));
  return j.data;
}

const CAT_MUT = `mutation($p:ID!,$c:ID){ productUpdate(product:{id:$p, category:$c}){ userErrors{ field message } } }`;
const OPT_MUT = `mutation($p:ID!,$o:OptionUpdateInput!,$vals:[OptionValueUpdateInput!]){
  productOptionUpdate(productId:$p, option:$o, optionValuesToUpdate:$vals){ userErrors{ field message } } }`;

async function main() {
  const snap = JSON.parse(readFileSync(fromArg.split('=').slice(1).join('='), 'utf8'));
  const prods = snap.products.slice(0, LIMIT);
  console.log(`\n=== ROLLBACK — ${APPLY ? 'APPLY' : 'DRY RUN'} from snapshot (${snap.taken_at}) ===`);
  console.log(`Restoring ${prods.length}${LIMIT < snap.products.length ? ` of ${snap.products.length}` : ''} products to their captured state.\n`);

  let ok = 0, fail = 0;
  for (const p of prods) {
    const sizeOpt = (p.options || []).find(o => o.name.trim().toLowerCase() === 'size');
    const wantCat = p.category?.id || null;
    const desc = `${p.title.slice(0, 38)} → cat=${p.category?.name || 'none'}` +
      (sizeOpt ? `, size[${sizeOpt.optionValues.map(v => v.name + (v.linkedMetafieldValue ? '*' : '')).join('/')}]` : '');
    if (!APPLY) { console.log('   would restore: ' + desc); continue; }
    try {
      // restore category
      const c = await gql(CAT_MUT, { p: p.id, c: wantCat });
      if (c.productUpdate.userErrors.length) throw new Error(JSON.stringify(c.productUpdate.userErrors));
      // restore size option (name + link state + each value)
      if (sizeOpt) {
        const lm = sizeOpt.linkedMetafield ? { namespace: sizeOpt.linkedMetafield.namespace, key: sizeOpt.linkedMetafield.key } : null;
        const vals = sizeOpt.optionValues.map(v => v.linkedMetafieldValue
          ? { id: v.id, linkedMetafieldValue: v.linkedMetafieldValue }
          : { id: v.id, name: v.name, linkedMetafieldValue: null });
        const r = await gql(OPT_MUT, { p: p.id, o: { id: sizeOpt.id, name: sizeOpt.name, linkedMetafield: lm }, vals });
        if (r.productOptionUpdate.userErrors.length) throw new Error(JSON.stringify(r.productOptionUpdate.userErrors));
      }
      ok++; console.log('   ✅ restored: ' + desc);
    } catch (e) { fail++; console.log('   ❌ ' + p.title.slice(0, 30) + ': ' + e.message.slice(0, 120)); }
  }
  console.log(`\n${APPLY ? `Done: ${ok} restored, ${fail} failed.` : 'DRY RUN — nothing written. Re-run with --apply to restore.'}`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
