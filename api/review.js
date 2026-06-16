// api/review.js
// Public, tokenized endpoints for the buyer review flow (no auth — possession of
// the 256-bit token is the credential). Two paths off the same token:
//   GET /api/review?token=...                 → buyer confirms receipt → release payout
//   GET /api/review?token=...&type=seller      → show a 1–5 star form for the seller
//   GET /api/review?token=...&type=seller&rating=N[&comment=...] → record the rating
//
// Confirming only speeds up a payout that auto-releases in 48h anyway, so a leaked
// token can't move money the wrong way.

import { txByReviewToken, recordBuyerConfirm, recordSellerReview } from '../lib/buyer-review.js';

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title></head>
  <body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 20px;text-align:center;color:#374151;">
  ${body}
  <p style="color:#9ca3af;font-size:12px;margin-top:32px;">The Phir Story — Pakistani Designer Resale</p>
  </body></html>`;
}

export default async function handler(req, res) {
  const { token, type, rating, comment } = req.query || {};
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!token) return res.status(400).send(page('Invalid link', '<h2>Invalid link</h2><p>This link is missing its token.</p>'));

  const tx = await txByReviewToken(token);
  if (!tx) return res.status(404).send(page('Link expired', '<h2>Link not found</h2><p>This link is no longer valid.</p>'));

  // ── Seller review (3b) ──────────────────────────────────────────────────────
  if (type === 'seller') {
    if (rating) {
      await recordSellerReview(tx.id, rating, comment).catch(() => {});
      return res.status(200).send(page('Thanks!', '<h2 style="color:#16a34a;">Thank you! 🌟</h2><p>Your rating has been recorded.</p>'));
    }
    const buttons = [1, 2, 3, 4, 5].map(n =>
      `<a href="/api/review?token=${encodeURIComponent(token)}&type=seller&rating=${n}" style="display:inline-block;width:48px;height:48px;line-height:48px;margin:4px;border-radius:8px;background:#C91A2B;color:#fff;text-decoration:none;font-size:18px;">${n}</a>`
    ).join('');
    return res.status(200).send(page('Rate your seller',
      `<h2>Rate your seller</h2><p>How was your experience buying <strong>${tx.product_title || 'your order'}</strong>? (1 = poor, 5 = great)</p><div style="margin:20px 0;">${buttons}</div>`));
  }

  // ── Buyer delivery confirmation (3a) ────────────────────────────────────────
  const r = await recordBuyerConfirm(tx.id).catch(() => ({ ok: false }));
  if (r.ok) {
    return res.status(200).send(page('Confirmed',
      `<h2 style="color:#16a34a;">Thank you! 🎉</h2><p>Glad your order arrived. Enjoy!</p><p style="font-size:14px;color:#6b7280;">Any issues? Email <a href="mailto:admin@thephirstory.com">admin@thephirstory.com</a>.</p>`));
  }
  return res.status(200).send(page('Thanks', '<h2>Thanks!</h2><p>We\'ve recorded your response.</p>'));
}
