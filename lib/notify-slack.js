// lib/notify-slack.js
//
// Single source of truth for pushing dashboard events into Slack — the sibling of
// lib/notify-sale.js. One module, one job: fire a single Incoming-Webhook POST.
//
// NO-OP if SLACK_WEBHOOK_URL is unset, so this ships dormant and changes nothing
// until the webhook is created in Slack and the env var is set in Vercel. The call
// only ever READS already-computed values and POSTs text — it can never alter a
// payout, a status, or any DB row, so wiring it into a handler is risk-free.

/**
 * Post a plain-text message to the configured Slack channel.
 * @param {string} text  Slack mrkdwn message (e.g. "💸 Payout sent ...").
 */
export async function notifySlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || !text) return; // dormant until configured

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    // Never let a Slack hiccup break the action that triggered it.
    console.error('Slack notify failed:', e.message);
  }
}
