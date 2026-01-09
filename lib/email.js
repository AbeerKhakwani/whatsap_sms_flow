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
