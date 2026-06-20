// scripts/backfill-chest-band.js
//
// Populates a `custom.chest_band` text metafield on every product so chest size can be
// filtered with FREE native Shopify checkboxes (Search & Discovery). Bands are derived
// from the curated `custom.chest_size` metafield where present, else parsed from the
// `custom.measurements` string ("… | Chest: 20\" | …"), normalized to pit-to-pit.
//
// Safe: only ever writes `custom.chest_band` (a NEW text field). It never touches the
// existing "Chest Size" (custom.chest_size) field or measurements. Self-contained REST
// with throttling + 429 retry so a full run doesn't get rate-limited or under-count.
//
// Usage:
//   node scripts/backfill-chest-band.js                 # DRY RUN (default) — writes nothing
//   node scripts/backfill-chest-band.js --apply         # actually write chest_band
//   node scripts/backfill-chest-band.js --limit=20      # only the first 20 products (testing)
//
// Then in Shopify admin: Settings → Custom data → Products → add a definition for
// custom.chest_band (Single line text), enable "Storefronts" access + "filterable",
// then Search & Discovery → Filters → add the Chest band filter.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
if (!SHOPIFY_URL || !SHOPIFY_TOKEN) {
  console.error('Missing Shopify store URL / access token in .env(.prod)');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ─── Pit-to-pit bands → the checkbox values. Edit to taste. ───
const BANDS = [
  { upTo: 18, label: 'Up to 18 in' },
  { upTo: 22, label: '19-22 in' },
  { upTo: 26, label: '23-26 in' },
  { upTo: Infinity, label: '27+ in' },
];
const bandFor = (v) => { for (const b of BANDS) if (v <= b.upTo) return b.label; return null; };

// Listings mix pit-to-pit (~14-26") and full circumference (~34-56"); halve the latter.
function normalizePitToPit(v) {
  if (v == null || Number.isNaN(v)) return null;
  if (v >= 28) v = v / 2;
  return Math.round(v * 2) / 2;
}
function chestFromMeasurements(str) {
  if (!str) return null;
  const m = String(str).match(/chest\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : null;
}
// custom.chest_size may be a plain number OR a dimension JSON ({"value":20,"unit":"INCHES"}).
function chestFromMetafieldValue(raw) {
  if (raw == null || raw === '') return null;
  if (/^[\d.\s]+$/.test(String(raw).trim())) {
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) return n;
  }
  try { const j = JSON.parse(raw); if (j && j.value != null) return parseFloat(j.value); } catch { /* not JSON */ }
  return null;
}
const mfValue = (mfs, ns, key) => mfs.find(m => m.namespace === ns && m.key === key)?.value ?? null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Throttled, 429-retrying REST client (Shopify allows ~2 calls/sec). ───
let lastCall = 0;
const MIN_GAP = 550;
async function shopifyFetch(path, opts = {}, attempt = 0) {
  const wait = MIN_GAP - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(`https://${SHOPIFY_URL}/admin/api/2024-10/${path}`, {
    ...opts,
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (res.status === 429 && attempt < 6) {
    const retryAfter = parseFloat(res.headers.get('retry-after') || '1');
    await sleep(Math.max(retryAfter * 1000, 1000 * (attempt + 1)));
    return shopifyFetch(path, opts, attempt + 1);
  }
  return res;
}

async function* allProducts() {
  let pageInfo = null;
  do {
    const params = new URLSearchParams({ limit: '250', fields: 'id,title' });
    if (pageInfo) params.set('page_info', pageInfo);
    const res = await shopifyFetch(`products.json?${params}`);
    if (!res.ok) throw new Error(`Products API ${res.status}: ${await res.text()}`);
    const link = res.headers.get('link') || '';
    const next = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    pageInfo = next ? next[1] : null;
    const { products } = await res.json();
    for (const p of products) yield p;
  } while (pageInfo);
}

async function getMetafields(productId) {
  const res = await shopifyFetch(`products/${productId}/metafields.json`);
  if (!res.ok) throw new Error(`metafields ${productId}: ${res.status}`);
  const { metafields } = await res.json();
  return metafields || [];
}

async function writeChestBand(productId, metafields, value) {
  const existing = metafields.find(m => m.namespace === 'custom' && m.key === 'chest_band');
  const path = existing ? `metafields/${existing.id}.json` : `products/${productId}/metafields.json`;
  const body = existing
    ? { metafield: { id: existing.id, value, type: 'single_line_text_field' } }
    : { metafield: { namespace: 'custom', key: 'chest_band', value, type: 'single_line_text_field' } };
  const res = await shopifyFetch(path, { method: existing ? 'PUT' : 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`write ${productId}: ${res.status} ${await res.text()}`);
}

async function main() {
  console.log(`\n${APPLY ? '🔴 APPLY' : '🟢 DRY RUN'} — chest_band backfill${LIMIT !== Infinity ? ` (first ${LIMIT})` : ''}\n`);
  const stats = { total: 0, noChest: 0, unchanged: 0, write: 0, dist: {} };

  for await (const p of allProducts()) {
    if (stats.total >= LIMIT) break;
    stats.total++;

    const mf = await getMetafields(p.id);
    const raw = chestFromMetafieldValue(mfValue(mf, 'custom', 'chest_size')) ?? chestFromMeasurements(mfValue(mf, 'custom', 'measurements'));
    const norm = normalizePitToPit(raw);
    const band = norm == null ? null : bandFor(norm);

    if (!band) { stats.noChest++; continue; }
    stats.dist[band] = (stats.dist[band] || 0) + 1;

    const existing = mfValue(mf, 'custom', 'chest_band');
    if (existing === band) { stats.unchanged++; continue; }

    stats.write++;
    console.log(`  ${String(p.title).slice(0, 42).padEnd(42)}  ${raw}" → ${norm}" → ${band}${existing ? `  (was: ${existing})` : ''}`);
    if (APPLY) await writeChestBand(p.id, mf, band);
  }

  console.log('\n── summary ──');
  console.log(`  products scanned : ${stats.total}`);
  console.log(`  no chest value   : ${stats.noChest} (skipped — fill chest_size or measurements)`);
  console.log(`  already correct  : ${stats.unchanged}`);
  console.log(`  ${APPLY ? 'written' : 'would write'}      : ${stats.write}`);
  console.log('  band distribution:');
  for (const [label, n] of Object.entries(stats.dist).sort()) console.log(`    ${label.padEnd(12)} ${n}`);
  if (!APPLY && stats.write) console.log('\n  Re-run with --apply to write these.');
  console.log('');
}

main().catch(e => { console.error('Backfill failed:', e.message); process.exit(1); });
