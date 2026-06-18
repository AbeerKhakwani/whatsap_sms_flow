// lib/cron/ownership-drift.js
// Nightly self-check: does any seller's shopify_product_ids array disagree with the
// authoritative Shopify seller metafields? If so, alert Slack so drift never silently
// accumulates again (this is what let one seller's array balloon to 88% of all products).
// Read-only — it never writes; an admin runs Scripts → Reconcile Ownership to heal.

import { supabase } from '../supabase-admin.js';
import { getAllSellerMetafields } from '../shopify-graphql.js';
import { notifySlack } from '../notify-slack.js';

export default async function handler(req, res) {
  try {
    const products = await getAllSellerMetafields();
    const { data: sellers } = await supabase.from('sellers').select('id, email, shopify_product_ids');

    const byId = new Map((sellers || []).map(s => [(s.id || '').trim(), s]));
    const byEmail = new Map((sellers || []).map(s => [(s.email || '').trim().toLowerCase(), s]));

    // Desired array per seller = exactly their metafield-owned products.
    const desired = new Map();
    let orphanActive = 0;
    for (const p of products) {
      const mid = (p.sellerId || '').trim();
      const me = (p.sellerEmail || '').trim().toLowerCase();
      const owner = (mid && byId.get(mid)) || (me && byEmail.get(me));
      if (!owner) { if (p.status === 'ACTIVE') orphanActive++; continue; }
      if (!desired.has(owner.id)) desired.set(owner.id, new Set());
      desired.get(owner.id).add(String(p.id));
    }

    let drifted = 0;
    let worst = null;
    for (const s of sellers || []) {
      const cur = new Set((s.shopify_product_ids || []).map(String));
      const des = desired.get(s.id) || new Set();
      const added = [...des].filter(id => !cur.has(id)).length;
      const removed = [...cur].filter(id => !des.has(id)).length;
      if (added || removed) {
        drifted++;
        const delta = added + removed;
        if (!worst || delta > worst.delta) worst = { email: s.email, delta, before: cur.size, after: des.size };
      }
    }

    if (drifted > 0) {
      const worstStr = worst ? ` Worst: ${worst.email} (${worst.before}→${worst.after}).` : '';
      await notifySlack(
        `⚠️ Ownership drift detected: ${drifted} seller(s) differ from Shopify metafields.${worstStr}` +
        (orphanActive ? ` ${orphanActive} active products have no owner metafield.` : '') +
        ` Heal via Scripts → Reconcile Ownership.`
      );
    }

    return res.status(200).json({ ok: true, drifted, orphanActive, worst });
  } catch (err) {
    console.error('ownership-drift cron error:', err);
    await notifySlack(`⚠️ Ownership drift check failed: ${err.message}`).catch(() => {});
    return res.status(500).json({ ok: false, error: err.message });
  }
}
