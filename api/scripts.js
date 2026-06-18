// api/scripts.js
// Endpoint backing the Scripts admin page. Each action is a one-off maintenance
// task that returns { success, output, summary } for the UI.

import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';
import { verifyToken } from '../lib/auth-utils.js';
import { getAllSellerMetafields } from '../lib/shopify-graphql.js';
import { cacheBust } from '../lib/cache.js';
import { setProductOwnership } from '../lib/listing-ownership.js';

// The 21 active orphans resolved from the Notion Sellers ledger (exact, unique-title matches).
// Applied via the Scripts-page button (admin-clicked) so the write originates from the dashboard.
const CONFIRMED_ORPHAN_OWNERS = [
  { productId: '8905591030055', sellerEmail: 'mahrukh_khalid@hotmail.com' },
  { productId: '9053878714663', sellerEmail: 'faqiha.g@gmail.com' },
  { productId: '9725043933479', sellerEmail: 'faqiha.g@gmail.com' },
  { productId: '9774848868647', sellerEmail: 'faqiha.g@gmail.com' },
  { productId: '9774924497191', sellerEmail: 'faqiha.g@gmail.com' },
  { productId: '9056688996647', sellerEmail: 'hinu0802@gmail.com' },
  { productId: '9059942105383', sellerEmail: 'mariakari1988@gmail.com' },
  { productId: '9215419973927', sellerEmail: 'mariam.haroon@gmail.com' },
  { productId: '9547627790631', sellerEmail: 'Bjaved@msn.com' },
  { productId: '9599862735143', sellerEmail: 'hannahmk60@gmail.com' },
  { productId: '9600667386151', sellerEmail: 'maham.shoaib206@gmail.com' },
  { productId: '9622855090471', sellerEmail: 'ali.noorua@gmail.com' },
  { productId: '9622905225511', sellerEmail: 'zanabtanveer99@gmail.com' },
  { productId: '9622930850087', sellerEmail: 'zanabtanveer99@gmail.com' },
  { productId: '9622948512039', sellerEmail: 'zanabtanveer99@gmail.com' },
  { productId: '9670319440167', sellerEmail: 'maheensafdar14@gmail.com' },
  { productId: '9670319472935', sellerEmail: 'jnayem248@gmail.com' },
  { productId: '9801388196135', sellerEmail: 'mredrose123@aol.com' },
  { productId: '9868879659303', sellerEmail: 'rehanamanzar@hotmail.com' },
  { productId: '9869252264231', sellerEmail: 'rehanamanzar@hotmail.com' },
  { productId: '10010719879463', sellerEmail: 'kirn666@gmail.com' },
];

function isAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  if (token === 'email-auth') return true; // legacy admin tokens
  const decoded = verifyToken(token);
  return decoded && decoded.type === 'admin';
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;

  try {
    if (action === 'backfill-admin-listings') {
      return await backfillAdminListings(res);
    }

    if (action === 'reconcile-ownership') {
      // Mutating ownership repair — admin only.
      if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
      return await reconcileOwnership(req, res);
    }

    if (action === 'assign-owners') {
      // Write seller metafields for products that have none (orphan recovery from CSV) — admin only.
      if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
      return await assignOwners(req, res);
    }

    if (action === 'assign-confident-orphans') {
      // Apply the 21 Notion-confirmed owner assignments. Admin-clicked from the Scripts page.
      if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
      return await assignOwners(req, res, CONFIRMED_ORPHAN_OWNERS);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error(`Script ${action} failed:`, err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Unknown error',
      output: []
    });
  }
}

async function backfillAdminListings(res) {
  const output = [];
  const log = (msg) => {
    output.push(msg);
    console.log(msg);
  };

  const { data: listings, error: lErr } = await supabase
    .from('listings')
    .select('id, seller_id, shopify_product_id')
    .not('shopify_product_id', 'is', null);

  if (lErr) throw new Error(`Read listings failed: ${lErr.message}`);

  const sellerIds = [...new Set(listings.map(l => l.seller_id).filter(Boolean))];

  const { data: sellers, error: sErr } = await supabase
    .from('sellers')
    .select('id, email, shopify_product_ids')
    .in('id', sellerIds);

  if (sErr) throw new Error(`Read sellers failed: ${sErr.message}`);

  const sellerById = new Map(sellers.map(s => [s.id, s]));
  const additionsBySeller = new Map();

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
    log(`  ${seller.email}  +${ids.size}  [${[...ids].join(', ')}]`);
  }

  if (additionsBySeller.size === 0) {
    log('Nothing to backfill — all listings already linked.');
    return res.status(200).json({
      success: true,
      output,
      summary: { 'sellers updated': 0, 'product IDs added': 0 }
    });
  }

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
      log(`  FAIL ${seller.email}: ${error.message}`);
      fail++;
    } else {
      ok++;
    }
  }

  log('');
  log(`Done. Updated ${ok} sellers, ${fail} failed.`);

  return res.status(200).json({
    success: fail === 0,
    output,
    summary: {
      'sellers updated': ok,
      'product IDs added': totalMissing,
      'failures': fail
    }
  });
}

/**
 * Assign owners (write seller metafields) for products that currently have none — orphan recovery.
 * Each assignment routes through setProductOwnership (the single write path: metafields + array +
 * listings + cache bust). Dry-run by default; pass apply:true in the body to write.
 *
 * Body: { assignments: [{ productId, sellerEmail }], apply?: boolean }
 */
async function assignOwners(req, res, preset) {
  const assignments = preset || req.body?.assignments || [];
  // apply can come from the request body (API) or the ?apply=true query (Scripts button).
  const apply = (req.body && req.body.apply === true) || req.query?.apply === 'true';
  const output = [];
  const log = (msg) => { output.push(msg); console.log(msg); };

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ success: false, error: 'No assignments provided' });
  }

  log(apply ? `⚠️  APPLY — writing ${assignments.length} owner assignments.` : `Dry run — ${assignments.length} assignments.`);
  let ok = 0, fail = 0, skip = 0;

  for (const a of assignments) {
    const productId = a.productId && String(a.productId);
    const sellerEmail = a.sellerEmail && String(a.sellerEmail).trim();
    if (!productId || !sellerEmail) { skip++; log(`  SKIP (missing field): ${JSON.stringify(a)}`); continue; }

    if (!apply) { log(`  would assign ${productId} → ${sellerEmail}`); continue; }

    try {
      await setProductOwnership(productId, sellerEmail);
      ok++;
      log(`  ✓ ${productId} → ${sellerEmail}`);
    } catch (err) {
      fail++;
      log(`  ✗ ${productId} → ${sellerEmail}: ${err.message}`);
    }
  }

  return res.status(200).json({
    success: fail === 0,
    dryRun: !apply,
    output,
    summary: { assignments: assignments.length, assigned: ok, failed: fail, skipped: skip },
  });
}

/**
 * Reconcile `sellers.shopify_product_ids` against the authoritative Shopify seller metafields.
 *
 * Shopify metafields (seller.id / seller.email) are the source of truth — the order webhook
 * reads them on purchase. This rebuilds each seller's array to EXACTLY the products whose
 * metafield owner is that seller: it removes products that drifted in (the Annie-406 problem)
 * and adds any that are missing. It never guesses — products with no/blank seller metafield are
 * reported as "orphans", and metafield owners not found in the DB are reported as "unknown".
 *
 * Dry-run by default (writes nothing); pass ?apply=true to write.
 */
async function reconcileOwnership(req, res) {
  const apply = req.query.apply === 'true' || req.body?.apply === true;
  const output = [];
  const log = (msg) => { output.push(msg); console.log(msg); };

  log(apply ? '⚠️  APPLY mode — writing changes.' : 'Dry run — no writes.');

  // 1. Truth: every product + its seller metafields, from Shopify (bulk GraphQL).
  const products = await getAllSellerMetafields();
  log(`Fetched ${products.length} products from Shopify.`);

  // 2. Sellers for validation + email→id mapping.
  const { data: sellers, error: sErr } = await supabase
    .from('sellers')
    .select('id, email, shopify_product_ids');
  if (sErr) throw new Error(`Read sellers failed: ${sErr.message}`);

  const byId = new Map(sellers.map(s => [(s.id || '').trim(), s]));
  const byEmail = new Map(sellers.map(s => [(s.email || '').trim().toLowerCase(), s]));

  // 3. Resolve each product's true owner → desired arrays (sellerId -> Set of product IDs).
  //    Metafield values can carry stray whitespace — trim before matching.
  const desired = new Map();
  let orphans = 0, unknown = 0;
  const orphanSample = [], unknownSample = [];
  const orphanStatus = {}; // ACTIVE/ARCHIVED/DRAFT breakdown for orphans
  const activeOrphanList = []; // {id, title} — the live ones that need a real owner

  for (const p of products) {
    const mfId = (p.sellerId || '').trim();
    const mfEmail = (p.sellerEmail || '').trim().toLowerCase();
    let owner = null;
    if (mfId && byId.has(mfId)) owner = byId.get(mfId);
    else if (mfEmail && byEmail.has(mfEmail)) owner = byEmail.get(mfEmail);

    if (!owner) {
      if (!mfId && !mfEmail) {
        orphans++;
        orphanStatus[p.status] = (orphanStatus[p.status] || 0) + 1;
        if (p.status === 'ACTIVE') activeOrphanList.push({ id: p.id, title: p.title });
        if (orphanSample.length < 12) orphanSample.push(p.id);
      } else {
        unknown++;
        if (unknownSample.length < 12) unknownSample.push(`${p.id}→${p.sellerEmail || p.sellerId}`);
      }
      continue;
    }
    if (!desired.has(owner.id)) desired.set(owner.id, new Set());
    desired.get(owner.id).add(String(p.id));
  }

  // 4. Per-seller diff: current array vs desired.
  const changes = [];
  for (const s of sellers) {
    const cur = new Set((s.shopify_product_ids || []).map(String));
    const des = desired.get(s.id) || new Set();
    const added = [...des].filter(id => !cur.has(id)).length;
    const removed = [...cur].filter(id => !des.has(id)).length;
    if (added || removed) changes.push({ id: s.id, email: s.email, before: cur.size, after: des.size, added, removed });
  }
  changes.sort((a, b) => (b.added + b.removed) - (a.added + a.removed));

  log('');
  log(`Orphan products (no seller metafield): ${orphans}  [${Object.entries(orphanStatus).map(([k, v]) => `${k}:${v}`).join(' ')}]${orphanSample.length ? `  e.g. [${orphanSample.join(', ')}]` : ''}`);
  log(`Unknown-owner products (metafield seller not in DB): ${unknown}${unknownSample.length ? `  e.g. [${unknownSample.join(', ')}]` : ''}`);
  log(`Sellers needing array changes: ${changes.length}`);
  for (const c of changes.slice(0, 25)) {
    log(`  ${c.email}: ${c.before} → ${c.after}   (+${c.added} / -${c.removed})`);
  }
  if (changes.length > 25) log(`  …and ${changes.length - 25} more`);

  const summary = {
    'products scanned': products.length,
    'orphan products (no metafield)': orphans,
    'unknown-owner products': unknown,
    'sellers needing changes': changes.length,
  };

  if (!apply) {
    log('');
    log('Dry run complete. Re-run with Apply to write these changes.');
    return res.status(200).json({ success: true, dryRun: true, output, summary, activeOrphanList });
  }

  // 5. Apply: overwrite each changed seller's array with the metafield-derived truth.
  let ok = 0, fail = 0;
  for (const c of changes) {
    const des = [...(desired.get(c.id) || new Set())];
    const { error } = await supabase.from('sellers').update({ shopify_product_ids: des }).eq('id', c.id);
    if (error) { fail++; log(`  FAIL ${c.email}: ${error.message}`); }
    else { ok++; await cacheBust(`listings:seller:${(c.email || '').toLowerCase()}`); }
  }
  await cacheBust('listings:all');

  log('');
  log(`Applied. ${ok} sellers updated, ${fail} failed.`);
  return res.status(200).json({
    success: fail === 0,
    applied: true,
    output,
    summary: { ...summary, 'sellers updated': ok, 'failures': fail },
  });
}
