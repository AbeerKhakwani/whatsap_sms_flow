#!/usr/bin/env node
/**
 * Sync shipping metafields from product tags (one-time backfill + drift check).
 *
 * - tag "concierge"  -> custom.shipped_by_tps = true
 * - no concierge tag -> custom.shipped_by_tps = false   (every product gets an explicit value)
 *   NOTE: shipped_by_tps was converted from text to BOOLEAN on 30 Aug 2026
 *   (scripts/convert-shipped-by-tps.mjs). It used to hold the strings "Shipped By TPS" /
 *   "Shipped By Seller"; writing those now fails type validation.
 * - tag "Canada"/"USA" -> custom.shipped_from = "Canada"/"USA"
 * - creates the custom.shipped_from definition if missing (choices: Canada, USA)
 *
 * Ongoing sync is handled by Shopify Flow (hourly); this script establishes the
 * starting state and can be re-run any time to check/repair drift.
 *
 * Usage:
 *   node scripts/sync-shipped-metafields.mjs            # dry run — prints planned changes
 *   node scripts/sync-shipped-metafields.mjs --apply    # write changes
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const STORE = 'ba42c1.myshopify.com';
const VAL_TPS = 'true';      // custom.shipped_by_tps is a boolean metafield
const VAL_SELLER = 'false';

const env = Object.fromEntries(
  fs.readFileSync('.env.prod', 'utf8').split(/\r?\n/)
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\\n$/, '')]; })
);
const TOKEN = (env.VITE_SHOPIFY_ACCESS_TOKEN || env.SHOPIFY_ACCESS_TOKEN || '').trim();
if (!TOKEN) { console.error('No Shopify token found in .env.prod'); process.exit(1); }

async function gql(query, variables) {
  const r = await fetch(`https://${STORE}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function ensureShippedFromDefinition() {
  const d = await gql(`{ metafieldDefinitions(first: 1, ownerType: PRODUCT, namespace: "custom", key: "shipped_from") { nodes { id } } }`);
  if (d.metafieldDefinitions.nodes.length) { console.log('custom.shipped_from definition already exists.'); return; }
  if (!APPLY) { console.log('[dry run] Would create custom.shipped_from definition (choices: Canada, USA).'); return; }
  const res = await gql(`mutation ($def: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $def) { createdDefinition { id } userErrors { field message } }
  }`, { def: {
    name: 'Shipped From', namespace: 'custom', key: 'shipped_from',
    type: 'single_line_text_field', ownerType: 'PRODUCT',
    validations: [{ name: 'choices', value: JSON.stringify(['Canada', 'USA']) }],
  } });
  const errs = res.metafieldDefinitionCreate.userErrors;
  console.log(errs.length ? `shipped_from definition FAILED: ${JSON.stringify(errs)}` : 'Created custom.shipped_from definition.');
}

async function fetchAllProducts() {
  const rows = [];
  let cursor = null;
  while (true) {
    const d = await gql(`{ products(first: 250${cursor ? `, after: "${cursor}"` : ''}) {
      pageInfo { hasNextPage endCursor }
      nodes { id title status tags
        tps: metafield(namespace: "custom", key: "shipped_by_tps") { value }
        from: metafield(namespace: "custom", key: "shipped_from") { value } }
    } }`);
    rows.push(...d.products.nodes);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return rows;
}

async function setMetafield(ownerId, key, value) {
  // shipped_by_tps is boolean; shipped_from is still a text field.
  const type = key === 'shipped_by_tps' ? 'boolean' : 'single_line_text_field';
  const res = await gql(`mutation ($mf: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $mf) { userErrors { field message } }
  }`, { mf: [{ ownerId, namespace: 'custom', key, type, value }] });
  const errs = res.metafieldsSet.userErrors;
  if (errs.length) console.log(`  FAIL ${ownerId} ${key}: ${JSON.stringify(errs)}`);
}

const products = await fetchAllProducts();
console.log(`${APPLY ? 'APPLY mode' : 'Dry run'} — scanned ${products.length} products.\n`);
await ensureShippedFromDefinition();

const changes = [];
for (const p of products) {
  const tags = p.tags.map(t => t.toLowerCase());
  const concierge = tags.includes('concierge');
  if (concierge && p.tps?.value !== VAL_TPS) changes.push({ p, key: 'shipped_by_tps', value: VAL_TPS });
  if (!concierge && p.tps?.value !== VAL_SELLER) changes.push({ p, key: 'shipped_by_tps', value: VAL_SELLER });
  const from = tags.includes('canada') ? 'Canada' : tags.includes('usa') ? 'USA' : null;
  if (from && p.from?.value !== from) changes.push({ p, key: 'shipped_from', value: from });
}

console.log(`\nPlanned metafield writes: ${changes.length}`);
for (const c of changes) {
  const id = c.p.id.replace('gid://shopify/Product/', '');
  console.log(`  ${id} [${c.p.status}] ${c.key} -> "${c.value}"   (${c.p.title.slice(0, 50)})`);
}

if (!APPLY) { console.log('\nDry run complete. Re-run with --apply to write.'); process.exit(0); }
for (const c of changes) await setMetafield(c.p.id, c.key, c.value);
console.log(`\nDone — ${changes.length} metafields written.`);
