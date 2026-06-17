// lib/notify-sale.js
//
// Single source of truth for the "your item sold" seller notification (WhatsApp + email).
// Every sale path — order webhook, seller API, legacy shopify webhook — routes through here,
// so the message text, the stripped-down email, and the eventual WhatsApp price-strip all
// live in exactly ONE place instead of being copy-pasted across five send-sites.

import { sendWhatsApp } from './send-whatsapp.js';
import { sendEmail } from './send-email.js';
import { itemSoldInlineEmail } from './email.js';

/**
 * Notify a seller that their item sold. Intentionally shows the seller NO money — the email
 * is stripped, and figures reach them only on the verified paid receipt.
 *
 * @param {object} opts
 * @param {object} opts.seller        - { id, phone, email, name }
 * @param {string} opts.productTitle
 * @param {number} [opts.salePrice]   - only used to fill the current WhatsApp template param (see note)
 */
export async function notifySellerItemSold({ seller, productTitle, salePrice }) {
  if (!seller) return;
  const price = Number(salePrice) || 0;
  const metadata = { productTitle, salePrice: price };

  if (seller.phone) {
    await sendWhatsApp({
      sellerId: seller.id,
      to: seller.phone,
      template: 'item_sold',
      // ⚠️ PRICE-STRIP: the Meta `item_sold` template still has 2 variables ({{1}} item,
      // {{2}} price). To remove the price from the actual WhatsApp message, edit that template
      // down to a single variable in Meta Business Manager, THEN change this to `[productTitle]`.
      // Dropping the param before the template is updated makes every send fail Meta validation.
      params: [productTitle, price.toFixed(0)],
      context: 'item_sold',
      metadata,
      textPreview: `🎉 Your item "${productTitle}" sold!`,
    }).catch(e => console.error('item_sold WhatsApp failed:', e.message));
  }

  if (seller.email) {
    const { subject, html } = itemSoldInlineEmail(seller.name, productTitle);
    await sendEmail({ sellerId: seller.id, to: seller.email, subject, html, context: 'item_sold', metadata })
      .catch(e => console.error('item_sold email failed:', e.message));
  }
}
