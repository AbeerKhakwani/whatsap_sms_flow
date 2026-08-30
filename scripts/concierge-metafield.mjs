// scripts/concierge-metafield.mjs
// Creates a BOOLEAN product metafield `custom.concierge` and sets it to true on every
// product carrying the `concierge` tag. Dry-run by default.
//
// Why: the storefront "Shipped by TPS" filter is built on the product-TAG attribute, and
// Shopify's Search & Discovery enumerates EVERY tag in the store (411 of them) as
// checkboxes. Value grouping only relabels/merges — it cannot restrict which values show.
// A filter built on a metafield only ever surfaces that metafield's values, so a boolean
// gives the true on/off.
//
// IMPORTANT: true is written ONLY on concierge products; everything else is left UNSET,
// not false. Writing false would give Search & Discovery two values to render (True and
// False) and you would be back to a two-checkbox filter.
//
// The `concierge` TAG is authoritative — api/order-webhook.js reads it on order-paid and
// the admin toggle sets it. custom.shipped_by_tps is a stale text mirror (13 products
// disagree with the tag) and is left alone here.
//
//   node scripts/concierge-metafield.mjs                # dry run
//   node scripts/concierge-metafield.mjs --apply        # create definition + backfill
//   node scripts/concierge-metafield.mjs --apply --definition-only
// Undo: delete the definition in Shopify admin (Settings → Custom data → Products),
//   or: node scripts/concierge-metafield.mjs --unset --apply

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod'), quiet: true });

const TOKEN = process.env.SHOPIFY_MIGRATION_TOKEN;
const API = 'https://ba42c1.myshopify.com/admin/api/2024-10/graphql.json';
const APPLY = process.argv.includes('--apply');
const DEF_ONLY = process.argv.includes('--definition-only');
const UNSET = process.argv.includes('--unset');
const NS = 'custom', KEY = 'concierge';
if (!TOKEN) { console.error('Missing SHOPIFY_MIGRATION_TOKEN in .env.prod'); process.exit(1); }

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

const CREATE_DEF = `mutation($d:MetafieldDefinitionInput!){
  metafieldDefinitionCreate(definition:$d){
    createdDefinition{ id name namespace key }
    userErrors{ field message code } } }`;
const SET = `mutation($m:[MetafieldsSetInput!]!){
  metafieldsSet(metafields:$m){ userErrors{ field message } } }`;
const DEL = `mutation($m:[MetafieldIdentifierInput!]!){
  metafieldsDelete(metafields:$m){ userErrors{ field message } } }`;

async function main() {
  // 1. Does the definition already exist?
  const defs = await gql(`{ metafieldDefinitions(first:100, ownerType:PRODUCT){ edges{ node{ id namespace key type{name} } } } }`);
  const existing = defs.metafieldDefinitions.edges.map(e => e.node)
    .find(n => n.namespace === NS && n.key === KEY);

  // 2. Every product + its tag / current metafield state
  const prods = []; let cur = null;
  do {
    const d = await gql(`query($c:String){ products(first:60, after:$c){ pageInfo{ hasNextPage endCursor }
      edges{ node{ id title status tags mf:metafield(namespace:"${NS}", key:"${KEY}"){ value }
        tps:metafield(namespace:"${NS}", key:"shipped_by_tps"){ value } } } } }`, { c: cur });
    prods.push(...d.products.edges.map(e => e.node));
    cur = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cur);

  const isConcierge = p => p.tags.some(t => t.trim().toLowerCase() === 'concierge');
  const TPS = 'Shipped By TPS', SELLER = 'Shipped By Seller';
  // Services and store goods ship as neither — leave their attribution empty.
  const NON_GARMENT = /gift card|dry cleaning|tps tote/i;
  const wantText = p => (isConcierge(p) ? TPS : SELLER);
  const textWrong = prods.filter(p => !NON_GARMENT.test(p.title) && (p.tps?.value ?? null) !== wantText(p));
  const want = prods.filter(isConcierge);
  const already = want.filter(p => p.mf?.value === 'true');
  const todo = want.filter(p => p.mf?.value !== 'true');
  // Anything flagged true that is NOT tagged — stale, should be cleared.
  const stale = prods.filter(p => p.mf?.value === 'true' && !isConcierge(p));

  const dir = join(__dirname, '..', 'backups'); mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const snap = join(dir, `concierge-snapshot-${stamp}.json`);
  writeFileSync(snap, JSON.stringify({ taken_at: new Date().toISOString(),
    products: prods.map(p => ({ id: p.id, title: p.title, status: p.status,
      tagged: isConcierge(p), concierge_mf: p.mf?.value ?? null, shipped_by_tps: p.tps?.value ?? null })) }, null, 2));

  console.log(`\n=== CONCIERGE BOOLEAN METAFIELD — ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
  console.log(`Snapshot: ${snap}`);
  console.log(`Definition ${NS}.${KEY}: ${existing ? `EXISTS (type ${existing.type.name})` : 'does not exist yet'}`);
  console.log(`Products: ${prods.length} | tagged concierge: ${want.length} (already true: ${already.length}, to set: ${todo.length})`);
  console.log(`Stale (true but not tagged, would be cleared): ${stale.length}`);
  console.log(`shipped_by_tps text disagreeing with the tag: ${textWrong.length}`);
  console.log(`Everything else is left UNSET so the filter renders a single checkbox.\n`);

  if (UNSET) {
    const all = prods.filter(p => p.mf?.value != null);
    console.log(`--unset: would clear ${NS}.${KEY} from ${all.length} products.`);
    if (!APPLY) return console.log('\nDRY RUN — nothing written.');
    for (let i = 0; i < all.length; i += 25) {
      const r = await gql(DEL, { m: all.slice(i, i + 25).map(p => ({ ownerId: p.id, namespace: NS, key: KEY })) });
      if (r.metafieldsDelete.userErrors.length) console.log('  errors:', JSON.stringify(r.metafieldsDelete.userErrors).slice(0, 160));
      await sleep(200);
    }
    return console.log(`Cleared ${all.length}.`);
  }

  // 3. Create the definition
  if (!existing) {
    if (!APPLY) console.log(`Would CREATE definition ${NS}.${KEY} (boolean, "Concierge", storefront-readable, filterable).`);
    else {
      const r = await gql(CREATE_DEF, { d: {
        name: 'Concierge', namespace: NS, key: KEY, type: 'boolean',
        ownerType: 'PRODUCT',
        description: 'True when The Phir Story holds and ships this item directly. Mirrors the `concierge` product tag.',
        access: { storefront: 'PUBLIC_READ' },
        capabilities: { adminFilterable: { enabled: true } },
      }});
      const errs = r.metafieldDefinitionCreate.userErrors;
      if (errs.length) { console.error('Could not create definition:', JSON.stringify(errs)); process.exit(1); }
      console.log(`✅ Created definition ${r.metafieldDefinitionCreate.createdDefinition.id}`);
    }
  } else if (existing.type.name !== 'boolean') {
    console.error(`\n❌ ${NS}.${KEY} exists but is type "${existing.type.name}", not boolean.`);
    console.error(`   Delete it in Shopify admin first — a definition's type cannot be changed.`);
    process.exit(1);
  }
  if (DEF_ONLY) return console.log('\n--definition-only: stopping before backfill.');

  if (!APPLY) {
    console.log(`\nWould set ${NS}.${KEY}=true on ${todo.length} products:`);
    todo.slice(0, 12).forEach(p => console.log(`   [${p.status}] ${p.title.slice(0, 46)}`));
    if (todo.length > 12) console.log(`   … and ${todo.length - 12} more`);
    if (stale.length) { console.log(`\nWould CLEAR from ${stale.length} no longer tagged:`);
      stale.forEach(p => console.log(`   [${p.status}] ${p.title.slice(0, 46)}`)); }
    if (textWrong.length) {
      console.log(`\nWould correct custom.shipped_by_tps on ${textWrong.length} products:`);
      textWrong.slice(0, 20).forEach(p => console.log(`   [${p.status}] ${p.title.slice(0, 42).padEnd(42)} ${JSON.stringify(p.tps?.value ?? null)} -> ${JSON.stringify(wantText(p))}`));
      if (textWrong.length > 20) console.log(`   … and ${textWrong.length - 20} more`);
    }
    return console.log(`\n⚠️  DRY RUN — nothing written. Re-run with --apply.`);
  }

  let set = 0;
  for (let i = 0; i < todo.length; i += 25) {
    const batch = todo.slice(i, i + 25);
    const r = await gql(SET, { m: batch.map(p => ({
      ownerId: p.id, namespace: NS, key: KEY, type: 'boolean', value: 'true' })) });
    const e = r.metafieldsSet.userErrors;
    if (e.length) console.log('  errors:', JSON.stringify(e).slice(0, 200));
    else { set += batch.length; batch.forEach(p => console.log(`  ✅ ${p.title.slice(0, 50)}`)); }
    await sleep(220);
  }
  let cleared = 0;
  for (let i = 0; i < stale.length; i += 25) {
    const batch = stale.slice(i, i + 25);
    const r = await gql(DEL, { m: batch.map(p => ({ ownerId: p.id, namespace: NS, key: KEY })) });
    if (!r.metafieldsDelete.userErrors.length) { cleared += batch.length; batch.forEach(p => console.log(`  🧹 cleared ${p.title.slice(0, 46)}`)); }
    await sleep(220);
  }
  let fixedText = 0;
  for (let i = 0; i < textWrong.length; i += 25) {
    const batch = textWrong.slice(i, i + 25);
    const r = await gql(SET, { m: batch.map(p => ({ ownerId: p.id, namespace: NS, key: 'shipped_by_tps',
      type: 'single_line_text_field', value: wantText(p) })) });
    const e = r.metafieldsSet.userErrors;
    if (e.length) console.log('  errors:', JSON.stringify(e).slice(0, 200));
    else { fixedText += batch.length; batch.forEach(p => console.log(`  📝 ${p.title.slice(0, 42).padEnd(42)} -> ${wantText(p)}`)); }
    await sleep(220);
  }
  console.log(`\nDone: ${set} set true, ${cleared} cleared, ${already.length} already correct, ${fixedText} text fields corrected.`);
  console.log(`\nNext, in Shopify admin:`);
  console.log(`  1. Search & Discovery → Filters → DELETE the tag-based "Shipped By TPS" filter`);
  console.log(`  2. Add filter → Metafield → Concierge (custom.concierge) → label it "Shipped by TPS"`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
