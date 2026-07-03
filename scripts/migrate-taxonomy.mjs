// scripts/migrate-taxonomy.mjs
// Reversible migration: categorize active+draft products -> Clothing + link adult sizes to the standard
// shopify.size taxonomy (canonical LETTER sizes XS/S/M/L/XL/XXL). Dry-run by default; snapshots first.
// Plan: /Users/ak/.claude/plans/how-will-this-work-sorted-torvalds.md
//
//   node scripts/migrate-taxonomy.mjs                 # dry-run + snapshot (no store writes)
//   node scripts/migrate-taxonomy.mjs --apply --limit=10   # apply to first 10 (test batch)
//   node scripts/migrate-taxonomy.mjs --apply              # full apply
// Rollback: node scripts/rollback-taxonomy.mjs --from=<snapshot> --apply

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod') });

const TOKEN = process.env.SHOPIFY_MIGRATION_TOKEN;
const API = 'https://ba42c1.myshopify.com/admin/api/2024-10/graphql.json';
const CLOTHING_CAT = 'gid://shopify/TaxonomyCategory/aa-1';
const APPLY = process.argv.includes('--apply');
const limArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;
if (!TOKEN) { console.error('Missing SHOPIFY_MIGRATION_TOKEN in .env.prod'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gql(query, variables, attempt = 0) {
  const res = await fetch(API, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (j.errors) {
    const throttled = JSON.stringify(j.errors).includes('THROTTLED');
    if (throttled && attempt < 6) { await sleep(2000 * (attempt + 1)); return gql(query, variables, attempt + 1); }
    throw new Error(JSON.stringify(j.errors).slice(0, 220));
  }
  return j.data;
}

const CANON = { xs:'XS', s:'S', m:'M', l:'L', xl:'XL', xxl:'XXL', xxs:'XXS', xxxl:'XXXL',
  'extra small':'XS', small:'S', smal:'S', medium:'M', large:'L', 'extra large':'XL', 'small (10)':'S' };
function canonAdult(raw){
  const v=(raw||'').trim(), low=v.toLowerCase();
  if (CANON[low]) return CANON[low];
  const p=low.match(/^\d+\s*\(\s*(xxs|xs|s|m|l|xl)\s*\)$/); if(p) return p[1].toUpperCase();
  return null;
}
const isKids = s => /^\s*\d+\s*(-\s*\d+\s*)?(years?|months?|y|m)\s*$/i.test(s||'');
const isCombo = s => /^(xxs|xs|s|m|l|xl)(\/(xxs|xs|s|m|l|xl))+$/i.test((s||'').trim());
const LINKABLE = new Set(['XS','S','M','L','XL','XXL']); // standard taxonomy has these only

const CAT_MUT = `mutation($p:ID!,$c:ID!){ productUpdate(product:{id:$p, category:$c}){ userErrors{ message } } }`;
const OPT_MUT = `mutation($p:ID!,$o:OptionUpdateInput!,$vals:[OptionValueUpdateInput!]){
  productOptionUpdate(productId:$p, option:$o, optionValuesToUpdate:$vals){ userErrors{ field message } } }`;

async function main(){
  // standard letter-size metaobject GIDs
  const so = await gql(`{ metaobjects(type:"shopify--size", first:120){ edges{ node{ id displayName } } } }`);
  const gid = {};
  for (const e of so.metaobjects.edges) if (LINKABLE.has(e.node.displayName)) gid[e.node.displayName] = e.node.id;
  const missing = [...LINKABLE].filter(l => !gid[l]);
  if (missing.length) { console.error(`Missing standard metaobjects for: ${missing.join(',')} — create them first.`); process.exit(1); }

  // snapshot active + draft (NOT archived)
  const prods = []; let cur = null;
  do {
    const d = await gql(`query($c:String){ products(first:60, query:"status:active OR status:draft", after:$c){ pageInfo{ hasNextPage endCursor }
      edges{ node{ id title category{ id name }
        options{ id name linkedMetafield{ namespace key } optionValues{ id name linkedMetafieldValue } }
        metafields(first:40){ edges{ node{ namespace key value type } } } } } } }`, { c: cur });
    prods.push(...d.products.edges.map(e => e.node));
    cur = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cur);

  const dir = join(__dirname, '..', 'backups'); mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const snapPath = join(dir, `shopify-taxonomy-snapshot-${stamp}.json`);
  writeFileSync(snapPath, JSON.stringify({ taken_at: new Date().toISOString(), count: prods.length, products: prods }, null, 2));

  console.log(`\n=== TAXONOMY MIGRATION — ${APPLY ? `APPLY${LIMIT < Infinity ? ` (first ${LIMIT})` : ''}` : 'DRY RUN'} ===`);
  console.log(`Snapshot: ${snapPath}  (${prods.length} active+draft products)`);
  console.log(`Standard size metaobjects: ${Object.keys(gid).join(', ')}\n`);

  let nCat = 0, nLink = 0, nSkip = 0, collide = [], done = 0;
  for (const p of prods) {
    if (done >= LIMIT) break;
    const acts = [];
    if (p.category?.name !== 'Clothing') acts.push('cat');

    const opt = p.options.find(o => o.name.trim().toLowerCase() === 'size');
    let valUpdates = null;
    if (opt) {
      // map each value -> canonical letter; only link XS/S/M/L/XL/XXL
      const mapped = opt.optionValues.map(ov => ({ ov, canon: (isKids(ov.name) || isCombo(ov.name)) ? null : canonAdult(ov.name) }));
      const linkable = mapped.filter(m => m.canon && LINKABLE.has(m.canon));
      const canons = linkable.map(m => m.canon);
      if (new Set(canons).size < canons.length) { collide.push(p.title.slice(0, 36)); }   // dual-value -> manual
      else if (linkable.length) {
        valUpdates = linkable
          .filter(m => m.ov.linkedMetafieldValue !== gid[m.canon])
          .map(m => ({ id: m.ov.id, linkedMetafieldValue: gid[m.canon] }));
        if (valUpdates.length) acts.push('link');
      }
    }
    if (!acts.length) { nSkip++; continue; }

    if (acts.includes('cat')) nCat++;
    if (acts.includes('link')) nLink++;
    if (!APPLY) { console.log(`  ${acts.join('+').padEnd(8)} ${p.title.slice(0, 46)}`); done++; continue; }

    try {
      if (acts.includes('cat')) {
        const r = await gql(CAT_MUT, { p: p.id, c: CLOTHING_CAT });
        if (r.productUpdate.userErrors.length) throw new Error('cat: ' + JSON.stringify(r.productUpdate.userErrors));
      }
      if (acts.includes('link')) {
        const r = await gql(OPT_MUT, { p: p.id,
          o: { id: opt.id, name: 'Size', linkedMetafield: { namespace: 'shopify', key: 'size' } }, vals: valUpdates });
        if (r.productOptionUpdate.userErrors.length) throw new Error('link: ' + JSON.stringify(r.productOptionUpdate.userErrors));
      }
      console.log(`  ✅ ${acts.join('+').padEnd(8)} ${p.title.slice(0, 44)}`);
    } catch (e) { console.log(`  ❌ ${p.title.slice(0, 30)}: ${e.message.slice(0, 110)}`); }
    done++; await sleep(120);
  }

  console.log(`\nProducts: ${prods.length} | categorize: ${nCat} | link: ${nLink} | skip(nothing/kids/combos): ${nSkip}`);
  console.log(`Dual-value collisions (manual, NOT touched): ${collide.length}${collide.length ? ' — ' + collide.join('; ') : ''}`);
  if (!APPLY) console.log(`\n⚠️  DRY RUN — nothing written. Snapshot saved. Re-run with --apply (optionally --limit=N).`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
