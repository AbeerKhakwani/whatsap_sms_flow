// lib/send-email.js
// Single-purpose: send an email via Resend, log result, alert admin on failure.

import { Resend } from 'resend';
import { logMessage } from './messages.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || 'The Phir Story <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'thephirstory@gmail.com';

/**
 * Send an email and log the result.
 * @param {Object} params
 * @param {string} [params.sellerId] - Seller UUID (for logging)
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.html - Email HTML body
 * @param {string} [params.context] - e.g. 'item_sold', 'listing_approved', 'payout_sent'
 * @param {Object} [params.metadata] - Extra data to log
 * @returns {{ success: boolean, error?: string, id?: string }}
 */
export async function sendEmail({ sellerId, to, subject, html, context, metadata }) {
  if (!to || !process.env.RESEND_API_KEY) {
    console.error(`❌ Email skipped (${context}): missing to or API key`);
    return { success: false, error: 'missing config' };
  }

  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

    if (error) {
      console.error(`❌ Email failed (${context}) to ${to}:`, error.message);
      if (sellerId) {
        await logMessage({ sellerId, type: 'email', recipient: to, subject, content: subject, context, metadata: { ...metadata, error: error.message }, status: 'failed' });
      }
      await alertAdmin(to, context, error.message);
      return { success: false, error: error.message };
    }

    console.log(`📧 Email sent (${context}) to ${to}`);
    if (sellerId) {
      await logMessage({ sellerId, type: 'email', recipient: to, subject, content: subject, context, metadata, status: 'sent' });
    }
    return { success: true, id: data?.id };
  } catch (err) {
    console.error(`❌ Email crashed (${context}) to ${to}:`, err.message);
    if (sellerId) {
      await logMessage({ sellerId, type: 'email', recipient: to, subject, content: subject, context, metadata: { ...metadata, error: err.message }, status: 'failed' });
    }
    await alertAdmin(to, context, err.message);
    return { success: false, error: err.message };
  }
}

async function alertAdmin(recipient, context, error) {
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `⚠️ Email failed: ${context} → ${recipient}`,
      html: `<p><strong>Email</strong> notification failed.</p><p>To: ${recipient}<br>Context: ${context}<br>Error: ${error}</p>`
    });
  } catch (e) {
    console.error('Admin alert email failed:', e.message);
  }
}
