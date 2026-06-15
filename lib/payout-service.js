// lib/payout-service.js
// One place that owns the final gates of a payout, so the cron, buyer-confirmation,
// the admin "release now" button, single mark-paid, bulk mark-paid, and the future
// Stripe path all call the SAME logic instead of copy-pasting it.
//
//   releasePayout(tx)   delivered → available (ready to pay) + notify seller
//   payViaProvider(tx)  record a payout as PAID via a provider (+ notify)
//
// Both use conditional updates so they can never double-act.

import { supabase } from './supabase-admin.js';
import { sendEmail } from './send-email.js';
import { sendWhatsApp } from './send-whatsapp.js';
import { payoutAvailableEmail, payoutNotificationEmail } from './email.js';

/**
 * Move a delivered transaction to 'available' (ready to pay) and notify the seller.
 * Safe to call from the cron timer, buyer confirmation, or a manual admin release —
 * the WHERE payout_status='delivered' guard means only one caller can win.
 * @returns {{ released: boolean, transaction?: object }}
 */
export async function releasePayout(tx) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ payout_status: 'available' })
    .eq('id', tx.id)
    .eq('payout_status', 'delivered') // guard: only release from 'delivered'
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { released: false }; // already released/paid/etc — no-op

  await notifyPayoutAvailable(data).catch(e => console.error('payout-available notify failed:', e.message));
  return { released: true, transaction: data };
}

/**
 * Record a payout as PAID via a provider. Today only `zelle_manual` (admin sent it
 * by hand). Adding `stripe_express` later = one new case here; nothing else changes.
 * @returns {{ transaction: object, notificationSent: boolean }}
 */
export async function payViaProvider(tx, { provider = 'zelle_manual', method, handle, adminNote, notify = true } = {}) {
  switch (provider) {
    // case 'stripe_express': return payViaStripe(tx, { ... });  // future
    case 'zelle_manual':
    default:
      return recordManualPaid(tx, { provider: 'zelle_manual', method, handle, adminNote, notify });
  }
}

async function recordManualPaid(tx, { provider, method, handle, adminNote, notify }) {
  const update = {
    status:         'paid',
    payout_status:  'paid',
    paid_at:        new Date().toISOString(),
    payout_provider: provider,
  };
  if (method) update.payout_method = method;
  if (handle) update.payout_handle = handle;
  if (adminNote) update.admin_note = adminNote;

  const { data, error } = await supabase
    .from('transactions')
    .update(update)
    .eq('id', tx.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  let notificationSent = false;
  if (notify && data.seller_id) {
    notificationSent = await notifyPayoutSent(data, { method }).catch(e => {
      console.error('payout_sent notify failed:', e.message);
      return false;
    });
  }
  return { transaction: data, notificationSent };
}

// ── notifications ──────────────────────────────────────────────────────────────

async function notifyPayoutAvailable(tx) {
  if (!tx.seller_id) return;
  const { data: seller } = await supabase
    .from('sellers').select('id, name, email, phone').eq('id', tx.seller_id).single();
  if (!seller) return;

  const metadata = { productTitle: tx.product_title, payout: tx.seller_payout };

  if (seller.phone && !seller.phone.startsWith('NOPHONE')) {
    await sendWhatsApp({
      sellerId: seller.id,
      to: seller.phone,
      textBody: `💰 Payout Available!\n\nHi ${seller.name || 'there'}! Your sale of "${tx.product_title}" is complete.\n\n$${tx.seller_payout?.toFixed(0) || '0'} is now available for payout!\n\nYou'll be paid out by the end of the month.`,
      context: 'payout_available',
      metadata,
    }).catch(e => console.error('payout_available WA failed:', e.message));
  }

  if (seller.email) {
    const { subject, html } = payoutAvailableEmail(seller.name, tx.product_title, tx.seller_payout);
    await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'payout_available', metadata })
      .catch(e => console.error('payout_available email failed:', e.message));
  }
}

async function notifyPayoutSent(tx, { method }) {
  const { data: seller } = await supabase
    .from('sellers').select('id, name, email, phone').eq('id', tx.seller_id).single();
  if (!seller?.email) return false;

  const metadata = { transactionId: tx.id, productTitle: tx.product_title, payout: tx.seller_payout, paymentMethod: method };

  const { subject, html } = payoutNotificationEmail(seller.name, tx.product_title, tx.seller_payout, method);
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
