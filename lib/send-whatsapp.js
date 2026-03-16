// lib/send-whatsapp.js
// Single-purpose: send a WhatsApp message (template or text), log result, alert admin on failure.

import { logMessage } from './messages.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'thephirstory@gmail.com';

/**
 * Send a WhatsApp message and log the result.
 * Supports three modes:
 *   - Template (simple): provide `template` + `params` (body-only)
 *   - Template (advanced): provide `template` + `components` (full control)
 *   - Text: provide `textBody`
 *
 * @param {Object} opts
 * @param {string} [opts.sellerId] - Seller UUID (for logging)
 * @param {string} opts.to - Recipient phone number
 * @param {string} [opts.template] - WhatsApp template name (template mode)
 * @param {string[]} [opts.params] - Template body parameters (simple template mode)
 * @param {Array} [opts.components] - Full components array (advanced template mode, overrides params)
 * @param {string} [opts.textBody] - Plain text message (text mode)
 * @param {string} [opts.context] - e.g. 'item_sold', 'listing_approved'
 * @param {Object} [opts.metadata] - Extra data to log
 * @param {string} [opts.textPreview] - Human-readable message for log display
 * @returns {{ success: boolean, error?: string }}
 */
export async function sendWhatsApp({ sellerId, to, template, params, components, textBody, context, metadata, textPreview }) {
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!to || !TOKEN || !PHONE_ID) {
    console.error(`❌ WhatsApp skipped (${context}): missing config`);
    return { success: false, error: 'missing config' };
  }

  // Clean phone number
  let phone = to.replace(/\D/g, '');
  if (!phone.startsWith('1') && phone.length === 10) phone = '1' + phone;

  const content = textPreview || textBody || `[template: ${template}]`;

  // Build payload — template or text
  let payload;
  if (textBody) {
    payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: textBody }
    };
  } else {
    // Template mode — use custom components if provided, else build from params
    const templateComponents = components || [{
      type: 'body',
      parameters: (params || []).map(p => ({ type: 'text', text: p }))
    }];
    payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: template,
        language: { code: 'en_US' },
        components: templateComponents
      }
    };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => `HTTP ${res.status}`);
      console.error(`❌ WhatsApp failed (${context}) to ${to}: ${errBody}`);
      if (sellerId) {
        await logMessage({ sellerId, type: 'whatsapp', recipient: to, content, context, metadata: { ...metadata, error: errBody }, status: 'failed' });
      }
      await alertAdmin(to, context, errBody);
      return { success: false, error: errBody };
    }

    const data = await res.json();
    const wamid = data?.messages?.[0]?.id || null;

    console.log(`📱 WhatsApp sent (${context}) to ${to}${wamid ? ` [${wamid}]` : ''}`);
    if (sellerId) {
      await logMessage({ sellerId, type: 'whatsapp', recipient: to, content, context, metadata, status: 'sent', externalId: wamid });
    }
    return { success: true, wamid };
  } catch (err) {
    console.error(`❌ WhatsApp crashed (${context}) to ${to}:`, err.message);
    if (sellerId) {
      await logMessage({ sellerId, type: 'whatsapp', recipient: to, content, context, metadata: { ...metadata, error: err.message }, status: 'failed' });
    }
    await alertAdmin(to, context, err.message);
    return { success: false, error: err.message };
  }
}

async function alertAdmin(recipient, context, error) {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const FROM = process.env.FROM_EMAIL || 'The Phir Story <onboarding@resend.dev>';
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `⚠️ WhatsApp failed: ${context} → ${recipient}`,
      html: `<p><strong>WhatsApp</strong> notification failed.</p><p>To: ${recipient}<br>Context: ${context}<br>Error: ${error}</p>`
    });
  } catch (e) {
    console.error('Admin alert email failed:', e.message);
  }
}
