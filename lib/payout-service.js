// lib/payout-service.js
// One place that owns the final gates of a payout, so the cron, buyer-confirmation,
// the admin "release now" button, single mark-paid, bulk mark-paid, and the future
// Stripe path all call the SAME logic instead of copy-pasting it.
//
//   releasePayout(tx)   delivered → available (ready to pay) — SILENT, no seller email
//   payViaProvider(tx)  record a payout as PAID via a provider (+ full breakdown receipt)
//
// Sellers hear twice: a minimal "sold" note at sale, and the verified breakdown
// receipt when paid. Nothing at the release step. Both use conditional updates so
// they can never double-act.

import { supabase } from './supabase-admin.js';
import { sendEmail } from './send-email.js';
import { sendWhatsApp } from './send-whatsapp.js';
import { payoutReceiptEmail } from './email.js';

/**
 * Move a delivered transaction to 'available' (ready to pay). SILENT — the seller is
 * not notified at this stage (they get the breakdown receipt only when paid).
 * Safe to call from the cron timer, buyer confirmation, or a manual admin release —
 * the WHERE payout_status='delivered' guard means only one caller can win.
 * @returns {{ released: boolean, transaction?: object }}
 */
export async function releasePayout(tx, { force = false } = {}) {
  // Release to 'available' from any non-terminal status. Idempotent: the NOT-IN guard
  // means it never touches paid/cancelled/already-available rows. Respects an admin
  // On-hold (payout_hold) unless force=true (manual admin override — "manual always allowed").
  let query = supabase
    .from('transactions')
    .update({ payout_status: 'available' })
    .eq('id', tx.id)
    .not('payout_status', 'in', '(paid,cancelled,available)');
  if (!force) query = query.eq('payout_hold', false);

  const { data, error } = await query.select().maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { released: false }; // already released/paid/cancelled/on-hold — no-op

  return { released: true, transaction: data };
}

/**
 * Record a payout as PAID via a provider. Today only `zelle_manual` (admin sent it
 * by hand). Adding `stripe_express` later = one new case here; nothing else changes.
 * @returns {{ transaction: object, notificationSent: boolean }}
 */
export async function payViaProvider(tx, { provider = 'zelle_manual', method, handle, reference, adminNote, payoutNotes, notify = true } = {}) {
  switch (provider) {
    // case 'stripe_express': return payViaStripe(tx, { ... });  // future — fills `reference` from the API
    case 'zelle_manual':
    default:
      return recordManualPaid(tx, { provider: 'zelle_manual', method, handle, reference, adminNote, payoutNotes, notify });
  }
}

async function recordManualPaid(tx, { provider, method, handle, reference, adminNote, payoutNotes, notify }) {
  const update = {
    status:         'paid',
    payout_status:  'paid',
    paid_at:        new Date().toISOString(),
    payout_provider: provider,
  };
  if (method) update.payout_method = method;
  if (handle) update.payout_handle = handle;
  // External payment reference (Zelle/Interac confirmation #, or later a Stripe/PayPal id).
  // The same value is stamped on every tx settled by one transfer, tying a batch together.
  if (reference != null) update.payout_reference = reference;
  if (adminNote) update.admin_note = adminNote;
  // Freeform internal notes the admin jots down at payout time — kept separate from
  // admin_note (which carries system context like seller-not-found / cancellations).
  if (payoutNotes != null) update.payout_notes = payoutNotes;

  const { data, error } = await supabase
    .from('transactions')
    .update(update)
    .eq('id', tx.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  let notificationSent = false;
  if (notify && data.seller_id) {
    notificationSent = await notifyPayoutSent(data, { method, handle }).catch(e => {
      console.error('payout_sent notify failed:', e.message);
      return false;
    });
  }
  return { transaction: data, notificationSent };
}

// ── notification ─────────────────────────────────────────────────────────────
// Sent only when the payout is actually paid: the full verified breakdown receipt.

async function notifyPayoutSent(tx, { method, handle }) {
  const { data: seller } = await supabase
    .from('sellers').select('id, name, email, phone').eq('id', tx.seller_id).single();
  if (!seller?.email) return false;

  const metadata = { transactionId: tx.id, productTitle: tx.product_title, payout: tx.seller_payout, paymentMethod: method };

  const { subject, html } = payoutReceiptEmail(seller.name, tx.product_title, {
    salePrice:      tx.sale_price,
    discount:       tx.discount_amount,
    platformFee:    tx.platform_fee ?? 10,
    commissionRate: tx.commission_rate,
    sellerPayout:   tx.seller_payout,
    method,
    handle: handle || tx.payout_handle,
  });
  const emailResult = await sendEmail({ sellerId: tx.seller_id, to: seller.email, subject, html, context: 'payout_sent', metadata });

  if (seller.phone && !seller.phone.startsWith('NOPHONE')) {
    // Never pass an empty template param — Meta rejects empty/whitespace-only values.
    const methodSuffix = method ? ` via ${method}` : ' to your account on file';
    await sendWhatsApp({
      sellerId: tx.seller_id,
      to: seller.phone,
      template: 'payout_sent',
      params: [seller.name || 'there', `$${tx.seller_payout?.toFixed(2)}`, tx.product_title, methodSuffix],
      context: 'payout_sent',
      metadata,
      textPreview: `Your payout of $${tx.seller_payout?.toFixed(2)} for "${tx.product_title}" has been sent${method ? ` via ${method}` : ''}.`,
    }).catch(e => console.error('payout_sent WA failed:', e.message));
  }

  return emailResult?.success || false;
}
