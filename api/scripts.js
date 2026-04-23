// api/scripts.js
// Endpoint backing the Scripts admin page. Each action is a one-off maintenance
// task that returns { success, output, summary } for the UI.

import { supabase } from '../lib/supabase-admin.js';
import { cors } from '../lib/cors.js';

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
