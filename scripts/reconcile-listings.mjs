// scripts/reconcile-listings.mjs
// Runs lib/listing-sync.js reconcileListing over every active listing — the same pass the
// admin write paths run per-product, applied in bulk. Idempotent: products already correct
// are untouched and reported as such.
//
// Fixes: non-canonical condition option, condition tag out of step with the option,
// concierge booleans out of step with the tag, and chest promoted out of the free-text
// measurements string into custom.chest_size.
//
//   node scripts/reconcile-listings.mjs                # dry run (reports, writes nothing)
//   node scripts/reconcile-listings.mjs --apply
//   node scripts/reconcile-listings.mjs --apply --limit=10

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod'), quiet: true });
// lib/listing-sync.js reads the app's runtime token names.
process.env.VITE_SHOPIFY_ACCESS_TOKEN ||= process.env.SHOPIFY_MIGRATION_TOKEN;

const { reconcileListing } = await import('../lib/listing-sync.js');
const { parseChest } = await import('../lib/measurements.js');
const { CONDITIONS, isConditionTag } = await import('../lib/conditions.js');

const TOKEN = process.env.SHOPIFY_MIGRATION_TOKEN;
const API = 'https://ba42c1.myshopify.com/admin/api/2024-10/graphql.json';
const APPLY = process.argv.includes('--apply');
const limArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;
const NON_GARMENT = /gift card|dry cleaning|tps tote/i;
if (!TOKEN) { console.error('Missing SHOPIFY_MIGRATION_TOKEN in .env.prod'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gql(q, v) {
  const r = await fetch(API, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 220));
  return j.data;
}

const prods = []; let cur = null;
do {
  const d = await gql(`query($c:String){ products(first:60, query:"status:active", after:$c){
    pageInfo{ hasNextPage endCursor }
    edges{ node{ id title tags options{ name optionValues{ name } }
      m:metafield(namespace:"custom", key:"measurements"){ value }
      ch:metafield(namespace:"custom", key:"chest_size"){ value }
      cc:metafield(namespace:"custom", key:"concierge"){ value }
      sb:metafield(namespace:"custom", key:"shipped_by_tps"){ value } } } } }`, { c: cur });
  prods.push(...d.products.edges.map(e => e.node));
  cur = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (cur);

const garments = prods.filter(p => !NON_GARMENT.test(p.title));

// Predict what reconcile will change, so a dry run is meaningful without writing.
function predict(p) {
  const out = [];
  const opt = p.options.find(o => /^conditions?$/i.test(o.name.trim()));
  const val = opt?.optionValues.length === 1 ? opt.optionValues[0].name : null;
  if (val && !CONDITIONS.includes(val)) out.push('condition option');
  if (val && CONDITIONS.includes(val)) {
    const ct = p.tags.filter(isConditionTag);
    if (ct.length !== 1 || ct[0] !== val) out.push('condition tag');
  }
  const conc = p.tags.some(t => t.trim().toLowerCase() === 'concierge');
  if (conc !== (p.cc?.value === 'true')) out.push('concierge bool');
  if (conc !== (p.sb?.value === 'true')) out.push('shipped_by_tps');
  if (parseChest(p.m?.value) != null && String(p.ch?.value ?? '').trim() === '') out.push('chest_size');
  return out;
}

const todo = garments.map(p => ({ p, will: predict(p) })).filter(x => x.will.length);
console.log(`\n=== RECONCILE ACTIVE LISTINGS — ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
console.log(`Active garments: ${garments.length} | already consistent: ${garments.length - todo.length} | to fix: ${todo.length}\n`);
const tally = {};
for (const t of todo) for (const w of t.will) tally[w] = (tally[w] || 0) + 1;
Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)} ${k}`));

if (!APPLY) {
  console.log('\nfirst 15:');
  todo.slice(0, 15).forEach(t => console.log(`   ${t.p.title.slice(0, 44).padEnd(44)} ${t.will.join(', ')}`));
  console.log(`\n⚠️  DRY RUN — nothing written. Re-run with --apply.`);
  process.exit(0);
}

const dir = join(__dirname, '..', 'backups'); mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
writeFileSync(join(dir, `reconcile-snapshot-${stamp}.json`),
  JSON.stringify({ taken_at: new Date().toISOString(), products: garments }, null, 2));

let ok = 0, fail = 0, n = 0;
for (const { p } of todo) {
  if (n >= LIMIT) break;
  const r = await reconcileListing(p.id);
  if (r.ok) { ok++; if (r.changed.length) console.log(`  ✅ ${p.title.slice(0, 40).padEnd(40)} ${r.changed.join(', ')}`); }
  else { fail++; console.log(`  ❌ ${p.title.slice(0, 40)}: ${r.error}`); }
  n++; await sleep(150);
}
console.log(`\nDone: ${ok} reconciled, ${fail} failed.`);
