// scripts/rollback-condition.mjs
// Restore products to a pre-migration snapshot taken by normalize-condition.mjs.
// Dry-run by default. Restores each product's condition option (name + value) and its FULL tag list.
// Metafields are not restored because the migration never wrote them.
//
//   node scripts/rollback-condition.mjs --from=backups/condition-snapshot-<...>.json           # dry-run
//   node scripts/rollback-condition.mjs --from=<snapshot> --apply --limit=1                    # restore 1
//   node scripts/rollback-condition.mjs --from=<snapshot> --apply                              # full restore

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod'), quiet: true });

const TOKEN = process.env.SHOPIFY_MIGRATION_TOKEN;
const API = 'https://ba42c1.myshopify.com/admin/api/2024-10/graphql.json';
const APPLY = process.argv.includes('--apply');
const fromArg = process.argv.find(a => a.startsWith('--from='));
const limArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;
if (!TOKEN) { console.error('Missing SHOPIFY_MIGRATION_TOKEN in .env.prod'); process.exit(1); }
if (!fromArg) { console.error('Required: --from=backups/condition-snapshot-<...>.json'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gql(query, variables, attempt = 0) {
  const res = await fetch(API, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (j.errors) {
    if (JSON.stringify(j.errors).includes('THROTTLED') && attempt < 6) {
      await sleep(2000 * (attempt + 1)); return gql(query, variables, attempt + 1);
    }
    throw new Error(JSON.stringify(j.errors).slice(0, 240));
  }
  return j.data;
}

const OPT_MUT = `mutation($p:ID!,$o:OptionUpdateInput!,$vals:[OptionValueUpdateInput!]){
  productOptionUpdate(productId:$p, option:$o, optionValuesToUpdate:$vals){ userErrors{ field message } } }`;
const TAG_MUT = `mutation($p:ID!,$t:[String!]!){ productUpdate(product:{id:$p, tags:$t}){ userErrors{ field message } } }`;

async function main() {
  const snap = JSON.parse(readFileSync(fromArg.split('=').slice(1).join('='), 'utf8'));
  const prods = snap.products.slice(0, LIMIT);
  console.log(`\n=== CONDITION ROLLBACK — ${APPLY ? 'APPLY' : 'DRY RUN'} from snapshot (${snap.taken_at}) ===`);
  console.log(`Restoring ${prods.length}${LIMIT < snap.products.length ? ` of ${snap.products.length}` : ''} products to captured state.\n`);

  let ok = 0, fail = 0, skip = 0;
  for (const p of prods) {
    const opt = (p.options || []).find(o => /^conditions?$/i.test(o.name.trim()));
    const desc = `${p.title.slice(0, 40).padEnd(40)} opt=${opt ? `"${opt.name}":${JSON.stringify(opt.optionValues.map(v => v.name))}` : 'none'} tags=${p.tags.length}`;
    if (!opt) { skip++; if (!APPLY) console.log(`   skip (no condition option): ${p.title.slice(0, 40)}`); continue; }
    if (!APPLY) { console.log(`   would restore: ${desc}`); continue; }
    try {
      const r = await gql(OPT_MUT, { p: p.id,
        o: { id: opt.id, name: opt.name },
        vals: opt.optionValues.map(v => ({ id: v.id, name: v.name })) });
      if (r.productOptionUpdate.userErrors.length) throw new Error(JSON.stringify(r.productOptionUpdate.userErrors));
      const t = await gql(TAG_MUT, { p: p.id, t: p.tags });
      if (t.productUpdate.userErrors.length) throw new Error(JSON.stringify(t.productUpdate.userErrors));
      ok++; console.log(`   ✅ ${desc}`);
    } catch (e) { fail++; console.log(`   ❌ ${p.title.slice(0, 34)}: ${e.message.slice(0, 120)}`); }
    await sleep(120);
  }
  console.log(`\n${APPLY ? `Done: ${ok} restored, ${fail} failed, ${skip} skipped.` : `DRY RUN — nothing written (${skip} have no condition option). Re-run with --apply.`}`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
