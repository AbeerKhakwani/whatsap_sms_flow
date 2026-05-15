// lib/email.js
// Email templates — return { subject, html } for each notification type.
// Actual sending is handled by lib/send-email.js

/**
 * Verification code email
 */
export function verificationCodeEmail(code) {
  return {
    subject: 'Your login code - The Phir Story',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a; margin-bottom: 20px;">Your verification code</h2>
        <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          ${code}
        </p>
        <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes.</p>
        <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Listing approved email
 */
export function listingApprovedEmail(sellerName, productTitle, productUrl, sellerPayout) {
  return {
    subject: `Your listing is live! - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Great news${sellerName ? `, ${sellerName}` : ''}!</h2>
        <p style="font-size: 16px; color: #374151;">
          Your listing <strong>${productTitle}</strong> is now live on The Phir Story.
        </p>
        <div style="margin: 24px 0;">
          <a href="${productUrl}" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Your Listing
          </a>
        </div>
        <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #166534;">
            <strong>When it sells, you'll receive:</strong>
            <span style="font-size: 24px; font-weight: bold; display: block; margin-top: 4px;">$${sellerPayout?.toFixed(2) || '0.00'}</span>
          </p>
        </div>
        <p style="color: #6b7280;">Thanks for selling with us!</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Payout notification email
 */
export function payoutNotificationEmail(sellerName, productTitle, amount, notes) {
  return {
    subject: `You've been paid! - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Payment Sent${sellerName ? `, ${sellerName}` : ''}!</h2>
        <p style="font-size: 16px; color: #374151;">
          Congratulations on your sale! We've sent your payout for <strong>${productTitle || 'your item'}</strong>.
        </p>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #166534; font-size: 14px;">Amount Sent</p>
          <p style="font-size: 36px; font-weight: bold; color: #16a34a; margin: 8px 0;">$${amount?.toFixed(2) || '0.00'}</p>
          ${notes ? `<p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">${notes}</p>` : ''}
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Payments are typically sent via PayPal. If you have any questions, just reply to this email.
        </p>
        <p style="color: #374151; margin-top: 20px;">
          Thanks for selling with The Phir Story! Ready to list more?
        </p>
        <div style="margin: 24px 0;">
          <a href="https://sell.thephirstory.com/seller" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            List Another Item
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Listing rejected email
 */
export function listingRejectedEmail(sellerName, productTitle, reason, note) {
  return {
    subject: `Update on your listing - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Update on Your Listing</h2>
        <p style="font-size: 16px; color: #374151;">
          Hi${sellerName ? ` ${sellerName}` : ''},
        </p>
        <p style="font-size: 16px; color: #374151;">
          We reviewed your listing <strong>${productTitle}</strong> and unfortunately we can't approve it at this time.
        </p>
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">Reason:</p>
          <p style="margin: 4px 0 0 0; color: #7f1d1d;">${reason}</p>
          ${note ? `<p style="margin: 12px 0 0 0; color: #7f1d1d; font-size: 14px;"><em>${note}</em></p>` : ''}
        </div>
        <p style="color: #374151;">
          You're welcome to submit a new listing that addresses these concerns. We're here to help!
        </p>
        <div style="margin: 24px 0;">
          <a href="https://sell.thephirstory.com/seller" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Submit New Listing
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Questions? Just reply to this email - we're happy to clarify!
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Revision request email — sent when admin asks seller to update a listing
 */
export function listingRevisionEmail(sellerName, productTitle, note, portalUrl) {
  return {
    subject: `Action needed: Update your listing – ${productTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #d97706;">Update Needed on Your Listing</h2>
        <p style="font-size: 16px; color: #374151;">
          Hi${sellerName ? ` ${sellerName}` : ''},
        </p>
        <p style="font-size: 16px; color: #374151;">
          Thanks for submitting <strong>${productTitle}</strong>. We'd love to approve it — we just need one small update first:
        </p>
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">${note}</p>
        </div>
        <p style="color: #374151;">Once you've made the update, we'll re-review and approve it as quickly as possible.</p>
        <div style="margin: 24px 0;">
          <a href="${portalUrl}" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Update My Listing
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Questions? Just reply to this email — we're happy to help!
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Welcome email
 */
export function welcomeEmail(name) {
  return {
    subject: 'Welcome to The Phir Story!',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Welcome${name ? `, ${name}` : ''}!</h2>
        <p style="font-size: 16px; color: #374151;">
          Your account is all set up. You can now list your Pakistani designer pieces for resale.
        </p>
        <div style="margin: 24px 0;">
          <a href="https://thephirstory.com/seller" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Go to Seller Portal
          </a>
        </div>
        <p style="color: #6b7280;">
          You can also list items via WhatsApp - just text us and say "SELL"!
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Shipping reminder email
 */
export function shippingReminderEmail(sellerName, productTitle, daysRemaining, dashboardUrl) {
  const isOverdue = daysRemaining < 0;
  const urgentStyle = isOverdue ? 'color: #dc2626; font-weight: bold;' : daysRemaining <= 2 ? 'color: #d97706; font-weight: bold;' : 'color: #374151;';

  return {
    subject: isOverdue
      ? `Urgent: Ship your item now - The Phir Story`
      : `Reminder: Ship "${productTitle}" - ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="${isOverdue ? 'color: #dc2626;' : 'color: #d97706;'}">
          ${isOverdue ? 'Shipping Overdue!' : 'Shipping Reminder'}
        </h2>
        <p style="font-size: 16px; color: #374151;">
          Hi${sellerName ? ` ${sellerName}` : ''},
        </p>
        <p style="font-size: 16px; color: #374151;">
          ${isOverdue
            ? `Your item <strong>${productTitle}</strong> is overdue for shipping. Please ship it as soon as possible to receive your payout.`
            : `Your item <strong>${productTitle}</strong> needs to be shipped soon.`
          }
        </p>
        <div style="background: ${isOverdue ? '#fef2f2' : '#fffbeb'}; border-left: 4px solid ${isOverdue ? '#dc2626' : '#d97706'}; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; ${urgentStyle}">
            ${isOverdue
              ? `⚠️ ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''} overdue`
              : `📦 ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining to ship`
            }
          </p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${dashboardUrl}" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Get Shipping Label
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Need help? Reply to this email and we'll assist you.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Item delivered email
 */
export function itemDeliveredEmail(sellerName, productTitle, payoutAmount, contestWindowEnds) {
  const endDate = new Date(contestWindowEnds);
  const formattedDate = endDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return {
    subject: `Your item was delivered! - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Package Delivered!</h2>
        <p style="font-size: 16px; color: #374151;">
          Hi${sellerName ? ` ${sellerName}` : ''},
        </p>
        <p style="font-size: 16px; color: #374151;">
          Great news! <strong>${productTitle}</strong> has been delivered to the buyer.
        </p>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #166534; font-size: 14px;">Your payout amount</p>
          <p style="font-size: 32px; font-weight: bold; color: #16a34a; margin: 8px 0;">$${payoutAmount?.toFixed(2) || '0.00'}</p>
          <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">
            Available for payout on ${formattedDate}
          </p>
        </div>
        <p style="color: #374151; font-size: 14px;">
          We have a 3-day buyer review period. If no issues arise, your payout will be processed automatically.
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          You'll receive another email when your payout is ready!
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Payout available email
 */
export function payoutAvailableEmail(sellerName, productTitle, payoutAmount) {
  return {
    subject: `Your payout is ready! - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Your Payout is Ready!</h2>
        <p style="font-size: 16px; color: #374151;">
          Hi${sellerName ? ` ${sellerName}` : ''},
        </p>
        <p style="font-size: 16px; color: #374151;">
          The buyer has confirmed receipt of <strong>${productTitle}</strong> and your payout is now available.
        </p>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #166534; font-size: 14px;">Ready for payout</p>
          <p style="font-size: 36px; font-weight: bold; color: #16a34a; margin: 8px 0;">$${payoutAmount?.toFixed(2) || '0.00'}</p>
        </div>
        <p style="color: #374151;">
          We'll process your payout via your preferred payment method shortly. If you haven't set up your payout method yet, please update it in your seller profile.
        </p>
        <div style="margin: 24px 0;">
          <a href="https://sell.thephirstory.com/seller/profile?tab=profile" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View My Balance
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Questions about your payout? Reply to this email!
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Item sold email (with shipping instructions)
 */
export function itemSoldEmail(sellerName, productTitle, salePrice, sellerPayout, shipByDate, dashboardUrl) {
  const formattedShipBy = new Date(shipByDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return {
    subject: `Your item sold! - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Congratulations, Your Item Sold!</h2>
        <p style="font-size: 16px; color: #374151;">
          Hi${sellerName ? ` ${sellerName}` : ''},
        </p>
        <p style="font-size: 16px; color: #374151;">
          <strong>${productTitle}</strong> has been purchased!
        </p>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="color: #6b7280;">Sale Price</span>
            <span style="color: #374151; font-weight: bold;">$${salePrice?.toFixed(2) || '0.00'}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid #d1fae5;">
            <span style="color: #166534; font-weight: bold;">Your Payout</span>
            <span style="color: #16a34a; font-weight: bold; font-size: 24px;">$${sellerPayout?.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-weight: bold;">⏰ Ship by ${formattedShipBy}</p>
          <p style="margin: 8px 0 0 0; color: #78350f; font-size: 14px;">
            You have 7 days to ship this item. Get your free shipping label from your dashboard.
          </p>
        </div>

        <div style="margin: 24px 0;">
          <a href="${dashboardUrl}" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Get Shipping Label
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Questions? Reply to this email or text us on WhatsApp.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

/**
 * Shipping label email (for seller.js sendShippingLabel)
 */
export function shippingLabelEmail(sellerName, productTitle, labelResult) {
  return {
    subject: `📦 Your Shipping Label - ${productTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px;">
        <h1 style="color: #2563eb;">📦 Your Shipping Label is Ready!</h1>
        <p>Here's your prepaid shipping label for <strong>${productTitle}</strong>.</p>

        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Tracking:</strong> ${labelResult.trackingNumber}</p>
          <p style="margin: 4px 0;"><strong>Carrier:</strong> ${labelResult.carrier} ${labelResult.service}</p>
          <p style="margin: 4px 0;"><strong>Est. Delivery:</strong> ${labelResult.estimatedDelivery}</p>
        </div>

        <a href="${labelResult.labelUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 8px 0;">Print Shipping Label</a>

        <h3 style="margin-top: 24px;">Next Steps:</h3>
        <ol>
          <li>Print the label (or show QR code at USPS)</li>
          <li>Pack your item securely</li>
          <li>Drop off at any USPS location</li>
        </ol>

        <p style="color: #6b7280; font-size: 14px;">We'll notify you when your item arrives at our warehouse!</p>
      </div>
    `
  };
}

/**
 * Item sold email — inline version used in seller.js notifySellerOfSale
 * (Richer HTML than the lib/email.js version, includes shipping CTA)
 */
// ─── Backward-compatible wrappers ──────────────────────────────────────────
// For callers not yet refactored (sms-webhook.js, admin-auth.js, tests).
// These compose the template + sendEmail so old call signatures still work.

export async function sendVerificationCode(email, code) {
  const { sendEmail } = await import('./send-email.js');
  const { subject, html } = verificationCodeEmail(code);
  return sendEmail({ to: email, subject, html, context: 'verification_code' });
}

export async function sendListingApproved(email, sellerName, productTitle, productUrl, sellerPayout) {
  const { sendEmail } = await import('./send-email.js');
  const { subject, html } = listingApprovedEmail(sellerName, productTitle, productUrl, sellerPayout);
  return sendEmail({ to: email, subject, html, context: 'listing_approved' });
}

export async function sendPayoutNotification(email, sellerName, productTitle, amount, notes) {
  const { sendEmail } = await import('./send-email.js');
  const { subject, html } = payoutNotificationEmail(sellerName, productTitle, amount, notes);
  return sendEmail({ to: email, subject, html, context: 'payout_sent' });
}

export async function sendListingRejected(email, sellerName, productTitle, reason, note) {
  const { sendEmail } = await import('./send-email.js');
  const { subject, html } = listingRejectedEmail(sellerName, productTitle, reason, note);
  return sendEmail({ to: email, subject, html, context: 'listing_rejected' });
}

export async function sendWelcomeEmail(email, name) {
  const { sendEmail } = await import('./send-email.js');
  const { subject, html } = welcomeEmail(name);
  return sendEmail({ to: email, subject, html, context: 'welcome' });
}

// ─── Templates for inline callers ──────────────────────────────────────────

// ─── Transfer notification emails ──────────────────────────────────────────

export function transferListingFromEmail(sellerName, productTitle, newSellerName) {
  return {
    subject: `Listing transferred - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #374151;">Listing Transferred</h2>
        <p>Hi${sellerName ? ` ${sellerName}` : ''},</p>
        <p>Your listing <strong>${productTitle}</strong> has been transferred to ${newSellerName || 'another seller'}.</p>
        <p style="color: #6b7280;">If you have any questions about this transfer, please contact us.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

export function transferListingToEmail(sellerName, productTitle) {
  return {
    subject: `A listing was assigned to you! - The Phir Story`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #16a34a;">Listing Assigned to You</h2>
        <p>Hi${sellerName ? ` ${sellerName}` : ''},</p>
        <p>The listing <strong>${productTitle}</strong> has been assigned to your account.</p>
        <p>You can view and manage it from your seller dashboard.</p>
        <a href="https://sell.thephirstory.com/seller/profile" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">View My Listings</a>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story - Pakistani Designer Resale</p>
      </div>
    `
  };
}

export async function sendTransferFromNotification(email, sellerName, productTitle, newSellerName) {
  const { sendEmail } = await import('./send-email.js');
  const { subject, html } = transferListingFromEmail(sellerName, productTitle, newSellerName);
  return sendEmail({ to: email, subject, html, context: 'transfer_from' });
}

export async function sendTransferToNotification(email, sellerName, productTitle) {
  const { sendEmail } = await import('./send-email.js');
  const { subject, html } = transferListingToEmail(sellerName, productTitle);
  return sendEmail({ to: email, subject, html, context: 'transfer_to' });
}

export function itemSoldInlineEmail(sellerName, productTitle, salePrice, sellerPayout) {
  const shippingSection = `
    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h3 style="margin: 0 0 8px 0; color: #9a3412;">📦 Next Step: Ship Your Item</h3>
      <p style="margin: 0 0 12px 0; color: #c2410c;">Go to <strong>My Sales</strong> in your dashboard to get your shipping label.</p>
      <a href="https://sell.thephirstory.com/seller/profile?tab=sales" style="display: inline-block; background: #C91A2B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Get Shipping Label</a>
    </div>
  `;

  return {
    subject: `🎉 Your item sold! - ${productTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h1 style="color: #16a34a;">🎉 Congratulations${sellerName ? `, ${sellerName}` : ''}!</h1>
        <p>Your item <strong>${productTitle}</strong> just sold for $${salePrice.toFixed(2)}!</p>
        <p style="font-size: 24px; color: #16a34a;"><strong>Your payout: $${sellerPayout.toFixed(2)}</strong></p>
        ${shippingSection}
        <p>We'll process your payment within 7 business days after we receive the item.</p>
        <a href="https://sell.thephirstory.com" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View Dashboard</a>
      </div>
    `
  };
}

/**
 * Email to seller when admin sets commission after the fact and confirms their payout.
 */
export function salePriceConfirmedEmail(sellerName, productTitle, salePrice, platformFee, commissionRate, sellerPayout) {
  const commissionBase = Math.max(0, salePrice - platformFee);
  const commissionAmount = commissionBase * (commissionRate / 100);
  return {
    subject: `Your payout for "${productTitle}" — $${sellerPayout.toFixed(2)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h1 style="color: #16a34a;">Your item sold!</h1>
        <p>Hi${sellerName ? ` ${sellerName}` : ''},</p>
        <p>Here's the breakdown for <strong>${productTitle}</strong>:</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr><td style="padding:6px 12px 6px 0; color:#6b7280;">Sale price</td><td style="text-align:right;">$${salePrice.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0; color:#6b7280;">Platform fee</td><td style="text-align:right;">-$${platformFee.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0; color:#6b7280;">Commission (${commissionRate}%)</td><td style="text-align:right;">-$${commissionAmount.toFixed(2)}</td></tr>
          <tr style="border-top:2px solid #e5e7eb;">
            <td style="padding:10px 12px 6px 0; font-weight:bold; color:#111827;">Your payout</td>
            <td style="text-align:right; font-weight:bold; font-size:20px; color:#16a34a;">$${sellerPayout.toFixed(2)}</td>
          </tr>
        </table>
        <p>Please ship your item and get your label from your dashboard.</p>
        <a href="https://sell.thephirstory.com/seller/profile?tab=sales" style="display:inline-block; background:#C91A2B; color:white; padding:12px 24px; text-decoration:none; border-radius:8px;">Get Shipping Label</a>
      </div>
    `
  };
}

/**
 * Email to seller when their sold item's order is cancelled.
 */
export function orderCancelledSellerEmail(sellerName, productTitle) {
  return {
    subject: `Order Cancelled — ${productTitle} is back on sale`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #374151;">Order Update for ${productTitle}</h2>
        <p>Hi${sellerName ? ` ${sellerName}` : ''},</p>
        <p>We wanted to let you know that the buyer's order for <strong>${productTitle}</strong> has been cancelled.</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #374151;">✅ <strong>Your item is back on sale</strong> on The Phir Story — no action needed from you.</p>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          We'll notify you again as soon as your item sells. If you have any questions, just reply to this email or message us on WhatsApp.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">The Phir Story — Pakistani Designer Resale</p>
      </div>
    `
  };
}
