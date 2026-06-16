// lib/buyer-review.js
// Buyer delivery confirmation (3a) + seller review request (3b).
//
// 3a: after delivery, ask the buyer to confirm they're happy. WhatsApp if we have
//     their phone (Meta template `buyer_delivery_confirm`), else email with a
//     tokenized link. Confirm → release payout now. Silence 48h → cron releases.
//     No dispute automation; the message tells buyers to email admin for issues.
// 3b: ~1 week after delivery, ask the buyer to rate the seller via a tokenized
//     web form link (WhatsApp text if phone, else email).

import crypto from 'crypto';
import { supabase } from './supabase-admin.js';
import { sendEmail } from './send-email.js';
import { sendWhatsApp } from './send-whatsapp.js';
import { buyerConfirmEmail, sellerReviewEmail } from './email.js';
import { releasePayout } from './payout-service.js';

const SITE = process.env.PUBLIC_BASE_URL || 'https://sell.thephirstory.com';
const newToken = () => crypto.randomBytes(32).toString('hex');

async function loadTx(txId) {
  const { data } = await supabase.from('transactions').select('*').eq('id', txId).single();
  return data;
}

/**
 * 3a — send the buyer a delivery-confirmation request. Idempotent on
 * review_request_sent_at. WhatsApp if phone (falls back to email if the template
 * send fails), else email.
 */
export async function sendBuyerConfirmRequest(txId) {
  const tx = await loadTx(txId);
  if (!tx || tx.review_request_sent_at) return { sent: false, reason: 'already-sent-or-missing' };

  const phone = tx.buyer_address?.phone?.trim();
  const email = tx.customer_email;
  const token = tx.review_token || newToken();
  const confirmUrl = `${SITE}/api/review?token=${token}`;

  let channel = null;

  if (phone) {
    const wa = await sendWhatsApp({
      to: phone,
      template: 'buyer_delivery_confirm',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: tx.product_title || 'your order' }] },
      ],
      context: 'buyer_confirm',
      metadata: { transactionId: tx.id },
      textPreview: `Did your order "${tx.product_title}" arrive okay? Tap to confirm. Any issues? Email admin@thephirstory.com`,
    }).catch(() => ({ success: false }));
    if (wa.success) channel = 'whatsapp';
  }

  if (!channel && email) {
    const { subject, html } = buyerConfirmEmail(tx.product_title, confirmUrl);
    const r = await sendEmail({ to: email, subject, html, context: 'buyer_confirm', metadata: { transactionId: tx.id } })
      .catch(() => ({ success: false }));
    if (r.success) channel = 'email';
  }

  if (!channel) return { sent: false, reason: 'no-channel' };

  await supabase.from('transactions').update({
    review_status: 'requested',
    review_request_sent_at: new Date().toISOString(),
    review_channel: channel,
    review_token: token,
  }).eq('id', tx.id);

  return { sent: true, channel };
}

/**
 * 3a — buyer confirmed receipt. Respond-once guarded; releases the payout.
 */
export async function recordBuyerConfirm(txId) {
  const tx = await loadTx(txId);
  if (!tx) return { ok: false, reason: 'missing' };
  if (tx.review_responded_at) return { ok: true, already: true };

  // respond-once guard via conditional update
  const { data, error } = await supabase
    .from('transactions')
    .update({ review_status: 'confirmed', review_responded_at: new Date().toISOString() })
    .eq('id', tx.id)
    .is('review_responded_at', null)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ok: true, already: true };

  await releasePayout(data).catch(e => console.error('release on buyer-confirm failed:', e.message));
  return { ok: true };
}

/**
 * Resolve a transaction from a review token (email-link path).
 */
export async function txByReviewToken(token) {
  if (!token) return null;
  const { data } = await supabase.from('transactions').select('*').eq('review_token', token).maybeSingle();
  return data;
}

/**
 * 3b — ask the buyer to rate the seller. Idempotent on seller_review_sent_at.
 * Link-to-form (tokenized); WhatsApp text if phone, else email.
 */
export async function sendSellerReviewRequest(txId) {
  const tx = await loadTx(txId);
  if (!tx || tx.seller_review_sent_at) return { sent: false };

  const token = tx.review_token || newToken();
  const reviewUrl = `${SITE}/api/review?token=${token}&type=seller`;
  const phone = tx.buyer_address?.phone?.trim();
  const email = tx.customer_email;
  let sent = false;

  if (phone) {
    const wa = await sendWhatsApp({
      to: phone,
      textBody: `Hi! How was your experience with the seller of "${tx.product_title}"? Leave a quick rating: ${reviewUrl}`,
      context: 'seller_review',
      metadata: { transactionId: tx.id },
    }).catch(() => ({ success: false }));
    sent = wa.success;
  }
  if (!sent && email) {
    const { subject, html } = sellerReviewEmail(tx.product_title, reviewUrl);
    const r = await sendEmail({ to: email, subject, html, context: 'seller_review', metadata: { transactionId: tx.id } })
      .catch(() => ({ success: false }));
    sent = r.success;
  }

  await supabase.from('transactions')
    .update({ seller_review_sent_at: new Date().toISOString(), review_token: token })
    .eq('id', tx.id);

  return { sent };
}

/**
 * 3b — record a seller rating (1–5) from the web form. One per transaction.
 */
export async function recordSellerReview(txId, rating, comment) {
  const r = Math.max(1, Math.min(5, parseInt(rating, 10) || 0));
  if (!r) return { ok: false, reason: 'bad-rating' };
  const tx = await loadTx(txId);
  if (!tx) return { ok: false, reason: 'missing' };

  const { error } = await supabase.from('seller_reviews').insert({
    seller_id: tx.seller_id,
    transaction_id: tx.id,
    rating: r,
    comment: comment || null,
  });
  // Unique index on transaction_id makes a second submit a no-op error — treat as ok.
  if (error && !String(error.message).toLowerCase().includes('duplicate')) {
    throw new Error(error.message);
  }
  return { ok: true };
}
