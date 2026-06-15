// scripts/audit-payouts.js
//
// Audit (and optionally fix) seller payouts that were stored with the wrong math.
//
// Three sale-creation paths used to forget the $10 platform fee, overpaying the
// seller (e.g. $82.00 instead of $73.80 on a $100 sale at 18%). This script
// recomputes the correct payout for every transaction using the single shared
// formula (lib/payout-calculation.js) and reports any mismatch.
//
// The stored `sale_price` is already net of any discount, so we recompute as:
//   correct payout = (sale_price − platform_fee) × (100 − commission%) / 100
//
// Usage:
//   node scripts/audit-payouts.js            # dry run — report only, no writes
//   node scripts/audit-payouts.js --apply    # correct ALL flagged rows (incl. already-paid)
//
// Already-paid rows: the money already went out at the higher amount. With --apply
// the stored record is corrected (so the books are accurate), but those rows are
// listed prominently under "SELLERS OVERPAID" so the real-world overpayment can be
// followed up separately. Correcting the record does NOT recover the money.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { calculateSellerPayout, PLATFORM_FEE } from '../lib/payout-calculation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.prod') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const TOLERANCE = 0.01; // ignore sub-cent rounding differences

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const money = n => `$${(Number(n) || 0).toFixed(2)}`;

async function main() {
  console.log(`\n💰 Payout audit — ${APPLY ? 'APPLY (will write)' : 'dry run (no writes)'}\n`);

  const { data: txns, error } = await supabase
    .from('transactions')
    .select('id, order_name, product_title, seller_id, sale_price, discount_amount, platform_fee, commission_rate, seller_payout, payout_status')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error querying transactions:', error.message);
    process.exit(1);
  }

  // Pull seller emails for nicer reporting.
  const sellerIds = [...new Set((txns || []).map(t => t.seller_id).filter(Boolean))];
  const sellerEmail = {};
  if (sellerIds.length) {
    const { data: sellers } = await supabase.from('sellers').select('id, email').in('id', sellerIds);
    for (const s of sellers || []) sellerEmail[s.id] = s.email;
  }

  const flagged = []; // { ...tx, expected, diff, email }

  for (const tx of txns || []) {
    // Only audit rows where commission is known — skip needs_commission/null.
    if (tx.commission_rate == null) continue;
    if (tx.seller_payout == null) continue;

    const platformFee = tx.platform_fee ?? PLATFORM_FEE;
    const { sellerPayout: expected } = calculateSellerPayout({
      grossPrice: tx.sale_price || 0, // sale_price is already net of discount
      commissionRate: tx.commission_rate,
      platformFee,
    });

    const diff = Number(tx.seller_payout) - Number(expected);
    if (Math.abs(diff) > TOLERANCE) {
      flagged.push({ ...tx, expected, diff, email: sellerEmail[tx.seller_id] || '(unknown)', platformFeeUsed: platformFee });
    }
  }

  const unpaid = flagged.filter(f => f.payout_status !== 'paid');
  const paid   = flagged.filter(f => f.payout_status === 'paid');

  if (!flagged.length) {
    console.log('✅ No mismatches found. Every stored payout matches the formula.\n');
    return;
  }

  const printRow = f =>
    `  ${f.id}  ${(f.order_name || '—').padEnd(8)}  stored ${money(f.seller_payout).padStart(9)}  →  correct ${money(f.expected).padStart(9)}  (diff ${money(f.diff)})  ${f.email}  "${f.product_title}"`;

  console.log(`Found ${flagged.length} mismatch(es): ${unpaid.length} un-paid, ${paid.length} already paid.\n`);

  if (unpaid.length) {
    console.log('── UN-PAID (safe to correct) ───────────────────────────────────────────');
    unpaid.forEach(f => console.log(printRow(f)));
    console.log('');
  }

  if (paid.length) {
    console.log('── ⚠️  SELLERS OVERPAID (money already sent — follow up separately) ──────');
    paid.forEach(f => console.log(printRow(f)));
    const totalOver = paid.reduce((s, f) => s + Math.max(0, f.diff), 0);
    console.log(`  Total overpaid across already-paid sales: ${money(totalOver)}`);
    console.log('');
  }

  if (!APPLY) {
    console.log('Dry run — nothing written. Re-run with --apply to correct these rows.\n');
    return;
  }

  // --apply: correct ALL flagged rows (incl. already-paid), per the user's decision.
  console.log('Applying corrections…');
  let fixed = 0;
  for (const f of flagged) {
    const { error: upErr } = await supabase
      .from('transactions')
      .update({ seller_payout: f.expected, platform_fee: f.platformFeeUsed })
      .eq('id', f.id);
    if (upErr) {
      console.error(`  ❌ ${f.id}: ${upErr.message}`);
    } else {
      fixed++;
    }
  }
  console.log(`\n✅ Corrected ${fixed}/${flagged.length} row(s).`);
  if (paid.length) {
    console.log(`⚠️  ${paid.length} of those were already paid — see the "SELLERS OVERPAID" list above for real-world follow-up.`);
  }
  console.log('');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
