// api/cron/health-check.js
// Daily health check — tests critical endpoints and alerts on failure
// Vercel Cron: runs at 8 AM daily (before other crons)
//
// NOTE: All dependencies are dynamically imported so that a single missing
// env var (e.g. SUPABASE_SERVICE_KEY) doesn't crash the whole function.

const BASE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://sell.thephirstory.com';

const ADMIN_PHONE = process.env.ADMIN_PHONE || '15034423865';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'thephirstory@gmail.com';

async function checkWithTimeout(name, fn, timeoutMs = 10000) {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
    return { name, ok: true, ms: Date.now() - start, detail: result };
  } catch (err) {
    return { name, ok: false, ms: Date.now() - start, error: err.message };
  }
}

// ── Individual checks ──

async function checkWhatsAppFlow() {
  const res = await fetch(`${BASE_URL}/api/whatsapp-flow`);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(body)}`);
  return 'endpoint alive';
}

async function checkWhatsAppToken() {
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!TOKEN || !PHONE_ID) throw new Error('Missing WHATSAPP_ACCESS_TOKEN or PHONE_NUMBER_ID');

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${PHONE_ID}?fields=verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return `${body.verified_name} — quality: ${body.quality_rating}`;
}

async function checkWhatsAppFlowStatus() {
  const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const FLOW_ID = process.env.WHATSAPP_FLOW_ID?.replace(/\\n/g, '').trim();
  if (!TOKEN || !FLOW_ID) throw new Error('Missing WHATSAPP_ACCESS_TOKEN or FLOW_ID');

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${FLOW_ID}?fields=status,health_status,endpoint_uri`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  if (body.status !== 'PUBLISHED') throw new Error(`Flow status: ${body.status} (expected PUBLISHED)`);

  const canSend = body.health_status?.can_send_message;
  if (canSend !== 'AVAILABLE') throw new Error(`Flow health: ${canSend} (expected AVAILABLE)`);

  return `PUBLISHED — endpoint: ${body.endpoint_uri}`;
}

async function checkSupabase() {
  const { supabase } = await import('../supabase-admin.js');
  const { count, error } = await supabase
    .from('sellers')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return `${count} sellers`;
}

async function checkShopify() {
  const SHOP = process.env.SHOPIFY_STORE || process.env.VITE_SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.VITE_SHOPIFY_ACCESS_TOKEN;
  if (!SHOP || !TOKEN) throw new Error('Missing SHOPIFY_STORE or ACCESS_TOKEN');

  const res = await fetch(
    `https://${SHOP}/admin/api/2024-10/products/count.json`,
    { headers: { 'X-Shopify-Access-Token': TOKEN } }
  );
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return `${body.count} products`;
}

async function checkPrivateKey() {
  const key = process.env.WHATSAPP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!key) throw new Error('WHATSAPP_PRIVATE_KEY not set');
  if (!key.includes('BEGIN') || !key.includes('END')) throw new Error('Private key malformed (missing BEGIN/END markers)');
  return 'key present and formatted';
}

// ── Alert helpers (dynamic import so missing keys don't crash) ──

async function alertAdmin(checks, failures) {
  const failList = failures.map(f => `• ${f.name}: ${f.error}`).join('\n');

  try {
    const { sendWhatsApp } = await import('../send-whatsapp.js');
    await sendWhatsApp({
      to: ADMIN_PHONE,
      textBody: `🚨 HEALTH CHECK FAILED\n\n${failures.length} issue(s) detected:\n\n${failList}\n\nCheck Vercel logs for details.`,
      context: 'health_check',
      metadata: { failures: failures.length }
    });
  } catch (e) {
    console.error('Failed to send WhatsApp alert:', e.message);
  }

  try {
    const { sendEmail } = await import('../send-email.js');
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `🚨 Phir Story Health Check — ${failures.length} failure(s)`,
      html: `
        <h2>Daily Health Check Failed</h2>
        <p>${failures.length} of ${checks.length} checks failed at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}:</p>
        <ul>${failures.map(f => `<li><strong>${f.name}</strong>: ${f.error} (${f.ms}ms)</li>`).join('')}</ul>
        <h3>All Results</h3>
        <ul>${checks.map(c => `<li>${c.ok ? '✅' : '🚨'} <strong>${c.name}</strong>: ${c.ok ? c.detail : c.error} (${c.ms}ms)</li>`).join('')}</ul>
      `,
      context: 'health_check',
      metadata: { failures: failures.length, total: checks.length }
    });
  } catch (e) {
    console.error('Failed to send email alert:', e.message);
  }
}

// ── Main handler ──

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('🏥 Running daily health check...');

  const checks = await Promise.all([
    checkWithTimeout('WhatsApp Flow Endpoint', checkWhatsAppFlow),
    checkWithTimeout('WhatsApp API Token', checkWhatsAppToken),
    checkWithTimeout('WhatsApp Flow Status', checkWhatsAppFlowStatus),
    checkWithTimeout('WhatsApp Private Key', checkPrivateKey, 2000),
    checkWithTimeout('Supabase', checkSupabase),
    checkWithTimeout('Shopify', checkShopify),
  ]);

  const failures = checks.filter(c => !c.ok);
  const allOk = failures.length === 0;

  for (const c of checks) {
    const icon = c.ok ? '✅' : '🚨';
    console.log(`  ${icon} ${c.name} (${c.ms}ms) — ${c.ok ? c.detail : c.error}`);
  }

  if (!allOk) {
    console.log(`🚨 ${failures.length} check(s) FAILED — sending alerts`);
    await alertAdmin(checks, failures);
  } else {
    console.log('✅ All checks passed');
  }

  return res.status(allOk ? 200 : 500).json({
    success: allOk,
    timestamp: new Date().toISOString(),
    checks: checks.map(c => ({
      name: c.name,
      ok: c.ok,
      ms: c.ms,
      detail: c.ok ? c.detail : undefined,
      error: c.ok ? undefined : c.error
    }))
  });
}
