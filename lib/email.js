// lib/email.js
// Email service using Resend

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Using Resend's default sender until custom domain is verified
const FROM_EMAIL = process.env.FROM_EMAIL || 'The Phir Story <onboarding@resend.dev>';

/**
 * Send verification code for login
 */
export async function sendVerificationCode(email, code) {
  try {
    console.log('Sending email to:', email, 'with key:', process.env.RESEND_API_KEY?.slice(0, 10) + '...');
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Email send error:', JSON.stringify(error));
      return { success: false, error };
    }
    console.log('Email sent successfully:', data);
    return { success: true, data };
  } catch (err) {
    console.error('Email service error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send notification when listing is approved
 */
export async function sendListingApproved(email, sellerName, productTitle, productUrl, sellerPayout) {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Email send error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}

/**
 * Send notification when payout is completed
 */
export async function sendPayoutNotification(email, sellerName, productTitle, amount, notes) {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Payout email error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}

/**
 * Send notification when listing is rejected
 */
export async function sendListingRejected(email, sellerName, productTitle, reason, note) {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Rejection email error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}

/**
 * Send welcome email to new seller
 */
export async function sendWelcomeEmail(email, name) {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Email send error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}

/**
 * Send shipping reminder to seller
 */
export async function sendShippingReminder(email, sellerName, productTitle, daysRemaining, dashboardUrl) {
  try {
    const isOverdue = daysRemaining < 0;
    const urgentStyle = isOverdue ? 'color: #dc2626; font-weight: bold;' : daysRemaining <= 2 ? 'color: #d97706; font-weight: bold;' : 'color: #374151;';

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Shipping reminder email error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}

/**
 * Send notification when item is delivered
 */
export async function sendItemDelivered(email, sellerName, productTitle, payoutAmount, contestWindowEnds) {
  try {
    const endDate = new Date(contestWindowEnds);
    const formattedDate = endDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Item delivered email error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}

/**
 * Send notification when payout is available (contest window ended)
 */
export async function sendPayoutAvailable(email, sellerName, productTitle, payoutAmount) {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Payout available email error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}

/**
 * Send notification when item is sold (with shipping instructions)
 */
export async function sendItemSold(email, sellerName, productTitle, salePrice, sellerPayout, shipByDate, dashboardUrl) {
  try {
    const formattedShipBy = new Date(shipByDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
    });

    if (error) {
      console.error('Item sold email error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}
