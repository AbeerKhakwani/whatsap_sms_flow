// api/scripts.js
// Endpoint backing the Scripts admin page. Each action is a one-off maintenance
// task that returns { success, output, summary } for the UI.

import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';
import { verifyToken } from '../lib/auth-utils.js';
import { getAllSellerMetafields } from '../lib/shopify-graphql.js';
import { cacheBust } from '../lib/cache.js';

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

  const byId = new Map(sellers.map(s => [s.id, s]));
  const byEmail = new Map(sellers.map(s => [(s.email || '').toLowerCase(), s]));

  // 3. Resolve each product's true owner → desired arrays (sellerId -> Set of product IDs).
  const desired = new Map();
  let orphans = 0, unknown = 0;
  const orphanSample = [], unknownSample = [];

  for (const p of products) {
    let owner = null;
    if (p.sellerId && byId.has(p.sellerId)) owner = byId.get(p.sellerId);
    else if (p.sellerEmail && byEmail.has(p.sellerEmail.toLowerCase())) owner = byEmail.get(p.sellerEmail.toLowerCase());

    if (!owner) {
      if (!p.sellerId && !p.sellerEmail) {
        orphans++;
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
  log(`Orphan products (no seller metafield): ${orphans}${orphanSample.length ? `  e.g. [${orphanSample.join(', ')}]` : ''}`);
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
    return res.status(200).json({ success: true, dryRun: true, output, summary });
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
