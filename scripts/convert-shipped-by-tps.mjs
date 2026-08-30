// scripts/convert-shipped-by-tps.mjs
// Converts custom.shipped_by_tps from single_line_text_field to BOOLEAN.
//   true  = product carries the `concierge` tag
//   false = it does not
//
// Shopify cannot change a metafield definition's type in place, so this must:
//   1. snapshot all existing text values (the only way back)
//   2. delete the definition AND its associated metafields
//   3. recreate the definition as boolean
//   4. backfill true/false from the `concierge` tag
//
// Safe to run because the storefront theme renders the shipping line from the TAG, not
// from this metafield (confirmed with the owner). The tag remains authoritative
// throughout; this field and custom.concierge are both mirrors of it.
//
//   node scripts/convert-shipped-by-tps.mjs               # dry run
//   node scripts/convert-shipped-by-tps.mjs --apply       # convert
//   node scripts/convert-shipped-by-tps.mjs --restore-text --from=<snapshot> --apply

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod'), quiet: true });

const TOKEN = process.env.SHOPIFY_MIGRATION_TOKEN;
const API = 'https://ba42c1.myshopify.com/admin/api/2024-10/graphql.json';
const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore-text');
const fromArg = process.argv.find(a => a.startsWith('--from='));
const NS = 'custom', KEY = 'shipped_by_tps';
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

const DEFS = `{ metafieldDefinitions(first:100, ownerType:PRODUCT){ edges{ node{
  id namespace key name type{name} description access{storefront} metafieldsCount pinnedPosition } } } }`;
const DEL_DEF = `mutation($id:ID!,$purge:Boolean!){
  metafieldDefinitionDelete(id:$id, deleteAllAssociatedMetafields:$purge){
    deletedDefinitionId userErrors{ field message code } } }`;
const CREATE_DEF = `mutation($d:MetafieldDefinitionInput!){
  metafieldDefinitionCreate(definition:$d){ createdDefinition{ id type{name} } userErrors{ field message code } } }`;
const SET = `mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ field message } } }`;

async function allProducts() {
  const out = []; let cur = null;
  do {
    const d = await gql(`query($c:String){ products(first:60, after:$c){ pageInfo{ hasNextPage endCursor }
      edges{ node{ id title status tags mf:metafield(namespace:"${NS}", key:"${KEY}"){ value type } } } } }`, { c: cur });
    out.push(...d.products.edges.map(e => e.node));
    cur = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cur);
  return out;
}
const isConcierge = p => p.tags.some(t => t.trim().toLowerCase() === 'concierge');

async function main() {
  const defs = await gql(DEFS);
  const def = defs.metafieldDefinitions.edges.map(e => e.node).find(n => n.namespace === NS && n.key === KEY);
  const prods = await allProducts();

  // ── restore path ──────────────────────────────────────────────────────
  if (RESTORE) {
    if (!fromArg) { console.error('Required: --from=backups/shipped-by-tps-snapshot-<...>.json'); process.exit(1); }
    const snap = JSON.parse(readFileSync(fromArg.split('=').slice(1).join('='), 'utf8'));
    const rows = snap.products.filter(p => p.value != null);
    console.log(`\n=== RESTORE TEXT — ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`Definition is currently: ${def ? def.type.name : 'absent'}`);
    console.log(`Would restore ${rows.length} text values from ${snap.taken_at}`);
    if (!APPLY) return console.log('\nDRY RUN — nothing written.');
    if (def && def.type.name !== 'single_line_text_field') {
      const r = await gql(DEL_DEF, { id: def.id, purge: true });
      if (r.metafieldDefinitionDelete.userErrors.length) throw new Error(JSON.stringify(r.metafieldDefinitionDelete.userErrors));
      console.log('Removed boolean definition.'); await sleep(3000);
    }
    const c = await gql(CREATE_DEF, { d: { name: snap.definition.name, namespace: NS, key: KEY,
      type: 'single_line_text_field', ownerType: 'PRODUCT', description: snap.definition.description || '',
      access: { storefront: 'PUBLIC_READ' } } });
    if (c.metafieldDefinitionCreate.userErrors.length) console.log('  (definition may already exist)');
    for (let i = 0; i < rows.length; i += 25) {
      const b = rows.slice(i, i + 25);
      await gql(SET, { m: b.map(p => ({ ownerId: p.id, namespace: NS, key: KEY, type: 'single_line_text_field', value: p.value })) });
      await sleep(220);
    }
    return console.log(`Restored ${rows.length} text values.`);
  }

  // ── convert path ──────────────────────────────────────────────────────
  const withValue = prods.filter(p => p.mf?.value != null);
  const wantTrue = prods.filter(isConcierge);
  const wantFalse = prods.filter(p => !isConcierge(p));

  const dir = join(__dirname, '..', 'backups'); mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const snapPath = join(dir, `shipped-by-tps-snapshot-${stamp}.json`);
  writeFileSync(snapPath, JSON.stringify({ taken_at: new Date().toISOString(),
    definition: def ? { name: def.name, type: def.type.name, description: def.description, pinnedPosition: def.pinnedPosition } : null,
    products: prods.map(p => ({ id: p.id, title: p.title, status: p.status, tagged: isConcierge(p), value: p.mf?.value ?? null })) }, null, 2));

  console.log(`\n=== shipped_by_tps → BOOLEAN — ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
  console.log(`Snapshot (the ONLY way back): ${snapPath}`);
  console.log(`Current definition: ${def ? `${def.type.name}, ${def.metafieldsCount} values, pinned ${def.pinnedPosition}` : 'ABSENT'}`);
  console.log(`Products ${prods.length} | text values to be destroyed: ${withValue.length}`);
  console.log(`After conversion: true on ${wantTrue.length} (tagged concierge), false on ${wantFalse.length}\n`);

  if (!APPLY) {
    console.log('Steps that would run:');
    console.log(`  1. DELETE definition ${def?.id} and all ${withValue.length} associated metafields`);
    console.log(`  2. CREATE ${NS}.${KEY} as boolean, name "Shipped By TPS", storefront PUBLIC_READ`);
    console.log(`  3. SET true on ${wantTrue.length}, false on ${wantFalse.length}`);
    console.log(`\nSample of values being destroyed:`);
    withValue.slice(0, 5).forEach(p => console.log(`   ${p.title.slice(0, 40).padEnd(40)} ${JSON.stringify(p.mf.value)}`));
    return console.log(`\n⚠️  DRY RUN — nothing written. Re-run with --apply.`);
  }

  if (def) {
    const r = await gql(DEL_DEF, { id: def.id, purge: true });
    const e = r.metafieldDefinitionDelete.userErrors;
    if (e.length) { console.error('Delete failed:', JSON.stringify(e)); process.exit(1); }
    console.log(`✅ Deleted definition ${r.metafieldDefinitionDelete.deletedDefinitionId} (+ its metafields)`);
    // Purging is asynchronous; wait until the values are actually gone or the boolean
    // definition will collide with leftover text values.
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      const left = (await allProducts()).filter(p => p.mf?.value != null).length;
      console.log(`   waiting for purge… ${left} values remain`);
      if (left === 0) break;
    }
  }

  const c = await gql(CREATE_DEF, { d: { name: 'Shipped By TPS', namespace: NS, key: KEY, type: 'boolean',
    ownerType: 'PRODUCT', description: 'True when The Phir Story ships this item directly (mirrors the `concierge` product tag).',
    access: { storefront: 'PUBLIC_READ' }, capabilities: { adminFilterable: { enabled: true } } } });
  const ce = c.metafieldDefinitionCreate.userErrors;
  if (ce.length) { console.error('Create failed:', JSON.stringify(ce)); process.exit(1); }
  console.log(`✅ Created ${NS}.${KEY} as ${c.metafieldDefinitionCreate.createdDefinition.type.name}`);

  let n = 0;
  for (const [list, val] of [[wantTrue, 'true'], [wantFalse, 'false']]) {
    for (let i = 0; i < list.length; i += 25) {
      const b = list.slice(i, i + 25);
      const r = await gql(SET, { m: b.map(p => ({ ownerId: p.id, namespace: NS, key: KEY, type: 'boolean', value: val })) });
      const e = r.metafieldsSet.userErrors;
      if (e.length) console.log('  errors:', JSON.stringify(e).slice(0, 200)); else n += b.length;
      await sleep(220);
    }
    console.log(`   set ${val} on ${list.length}`);
  }
  console.log(`\nDone: ${n} products written.`);
  console.log(`Rollback: node scripts/convert-shipped-by-tps.mjs --restore-text --from=${snapPath} --apply`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
