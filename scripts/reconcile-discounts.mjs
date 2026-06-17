// scripts/reconcile-discounts.mjs
// Repair transactions whose Shopify order has a discount allocation we never captured
// (e.g. a code applied after the order webhook fired). Recomputes discount_amount,
// sale_price (net), and seller_payout. Only touches NON-paid items with a known commission.
//
//   node scripts/reconcile-discounts.mjs           # dry run
//   node scripts/reconcile-discounts.mjs --apply   # write

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calculateSellerPayout } from '../lib/payout-calculation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.prod') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const SHOP = (process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP || '').trim();
const STOKEN = (process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '').trim();
const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const orderCache = {};
async function getOrder(orderId) {
  if (orderId in orderCache) return orderCache[orderId];
  const r = await fetch(`https://${SHOP}/admin/api/2024-10/orders/${orderId}.json?fields=id,name,line_items`, { headers: { 'X-Shopify-Access-Token': STOKEN } });
  orderCache[orderId] = r.ok ? (await r.json()).order : null;
  return orderCache[orderId];
}

const { data: txns, error } = await supabase.from('transactions')
  .select('id, order_id, product_id, product_title, sale_price, discount_amount, commission_rate, seller_payout, platform_fee, payout_status')
  .not('payout_status', 'in', '(paid,cancelled)');
if (error) { console.error(error.message); process.exit(1); }

console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — scanning ${txns.length} unpaid transactions for missed discounts\n`);

let fixed = 0;
for (const tx of txns) {
  if (!/^\d+$/.test(String(tx.order_id))) continue;
  if (tx.commission_rate == null) continue;            // needs-commission items handled elsewhere
  const order = await getOrder(tx.order_id);
  if (!order) continue;
  const li = (order.line_items || []).find(l => String(l.product_id) === String(tx.product_id));
  if (!li) continue;
  const alloc = (li.discount_allocations || []).reduce((s, d) => s + parseFloat(d.amount || 0), 0);
  const curDisc = parseFloat(tx.discount_amount || 0);
  if (alloc <= 0.005) continue;                        // no order discount on this line
  if (Math.abs(alloc - curDisc) < 0.005) continue;     // already captured correctly

  const full = parseFloat(li.price);
  const fee = tx.platform_fee ?? 10;
  const { sellerPayout } = calculateSellerPayout({ grossPrice: full, discount: alloc, commissionRate: tx.commission_rate, platformFee: fee });
  const newSale = +(full - alloc).toFixed(2);
  const newPayout = sellerPayout == null ? null : +sellerPayout.toFixed(2);

  console.log(`  ${(tx.product_title || '').slice(0,32).padEnd(32)} ${order.name}  disc $${curDisc.toFixed(2)}→$${alloc.toFixed(2)}  sale $${Number(tx.sale_price).toFixed(2)}→$${newSale.toFixed(2)}  payout $${Number(tx.seller_payout).toFixed(2)}→$${newPayout}`);

  if (APPLY) {
    const { error: upErr } = await supabase.from('transactions')
      .update({ discount_amount: alloc, sale_price: newSale, ...(newPayout != null ? { seller_payout: newPayout } : {}) })
      .eq('id', tx.id);
    if (upErr) console.log('    ERROR:', upErr.message); else fixed++;
  }
}

console.log(APPLY ? `\nApplied ${fixed} fix(es).\n` : `\nDry run complete. Re-run with --apply to write.\n`);
