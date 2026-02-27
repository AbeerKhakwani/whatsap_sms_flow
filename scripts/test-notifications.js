// scripts/test-notifications.js
// Verify send-email and send-whatsapp services work end-to-end
// Tests: send success, send failure, logging, admin alerts
//
// Usage:
//   node scripts/test-notifications.js              # dry run (no real sends)
//   node scripts/test-notifications.js --live        # actually send to your email/phone
//   node scripts/test-notifications.js --live-email   # email only
//   node scripts/test-notifications.js --live-wa      # whatsapp only

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// ─── Config ──────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'thephirstory@gmail.com';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const mode = process.argv[2] || '--dry';
const isLive = mode === '--live';
const isLiveEmail = mode === '--live-email' || isLive;
const isLiveWA = mode === '--live-wa' || isLive;

let passed = 0;
let failed = 0;
let skipped = 0;

// Check if Supabase env is available (needed for send services that import messages.js)
const hasSupabase = !!(process.env.SUPABASE_SERVICE_KEY && (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL));

function ok(label) { passed++; console.log(`  ✅ ${label}`); }
function fail(label, err) { failed++; console.log(`  ❌ ${label}: ${err}`); }
function skip(label) { skipped++; console.log(`  ⏭️  ${label} (needs SUPABASE_SERVICE_KEY)`); }

// ─── 1. Import checks ───────────────────────────────────
async function testImports() {
  console.log('\n📦 1. Import Checks\n');

  if (hasSupabase) {
    try {
      const { sendEmail } = await import('../lib/send-email.js');
      if (typeof sendEmail === 'function') ok('sendEmail is a function');
      else fail('sendEmail', 'not a function');
    } catch (e) { fail('import send-email.js', e.message); }

    try {
      const { sendWhatsApp } = await import('../lib/send-whatsapp.js');
      if (typeof sendWhatsApp === 'function') ok('sendWhatsApp is a function');
      else fail('sendWhatsApp', 'not a function');
    } catch (e) { fail('import send-whatsapp.js', e.message); }
  } else {
    skip('sendEmail import');
    skip('sendWhatsApp import');
    console.log('  ℹ️  Send services need Supabase for message logging.');
    console.log('  ℹ️  Add SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL to .env to test them locally.');
    console.log('  ℹ️  They WILL work on Vercel where env vars are set.');
  }

  // All email templates
  try {
    const templates = await import('../lib/email.js');
    const expected = [
      'verificationCodeEmail', 'listingApprovedEmail', 'payoutNotificationEmail',
      'listingRejectedEmail', 'welcomeEmail', 'shippingReminderEmail',
      'itemDeliveredEmail', 'payoutAvailableEmail', 'itemSoldEmail',
      'shippingLabelEmail', 'itemSoldInlineEmail'
    ];
    for (const name of expected) {
      if (typeof templates[name] === 'function') ok(`${name} exported`);
      else fail(name, 'missing or not a function');
    }

    // Backward-compat wrappers
    const wrappers = ['sendVerificationCode', 'sendListingApproved', 'sendPayoutNotification', 'sendListingRejected', 'sendWelcomeEmail'];
    for (const name of wrappers) {
      if (typeof templates[name] === 'function') ok(`${name} (compat wrapper) exported`);
      else fail(name, 'compat wrapper missing');
    }
  } catch (e) { fail('import email.js', e.message); }
}

// ─── 2. Template output checks ──────────────────────────
async function testTemplates() {
  console.log('\n📝 2. Template Output Checks\n');

  const templates = await import('../lib/email.js');

  const cases = [
    { fn: 'verificationCodeEmail', args: ['123456'], expectSubject: /verif|code/i },
    { fn: 'listingApprovedEmail', args: ['Jane', 'Sana Safinaz Kurta', 'https://example.com', 82], expectSubject: /approv|live/i },
    { fn: 'listingRejectedEmail', args: ['Jane', 'Sana Safinaz Kurta', 'Poor Photo Quality'], expectSubject: /reject|update/i },
    { fn: 'welcomeEmail', args: ['Jane'], expectSubject: /welcome/i },
    { fn: 'shippingReminderEmail', args: ['Jane', 'Sana Safinaz Kurta', 3, 'https://example.com'], expectSubject: /ship/i },
    { fn: 'itemDeliveredEmail', args: ['Jane', 'Sana Safinaz Kurta', 82], expectSubject: /deliver/i },
    { fn: 'payoutAvailableEmail', args: ['Jane', 'Sana Safinaz Kurta', 82], expectSubject: /payout/i },
    { fn: 'payoutNotificationEmail', args: ['Jane', 'Sana Safinaz Kurta', 82, 'PayPal'], expectSubject: /payout|paid/i },
    { fn: 'itemSoldEmail', args: ['Jane', 'Sana Safinaz Kurta', 100, 82], expectSubject: /sold/i },
    { fn: 'itemSoldInlineEmail', args: ['Jane', 'Sana Safinaz Kurta', 100, 82], expectSubject: /sold/i },
    { fn: 'shippingLabelEmail', args: ['Jane', 'Sana Safinaz Kurta', 'https://label.url', 82], expectSubject: /ship|label/i },
  ];

  for (const tc of cases) {
    try {
      const result = templates[tc.fn](...tc.args);
      if (!result.subject) { fail(`${tc.fn} subject`, 'missing'); continue; }
      if (!result.html) { fail(`${tc.fn} html`, 'missing'); continue; }
      if (!tc.expectSubject.test(result.subject)) { fail(`${tc.fn} subject`, `"${result.subject}" doesn't match ${tc.expectSubject}`); continue; }
      if (!result.html.includes('</')) { fail(`${tc.fn} html`, 'not valid HTML'); continue; }
      ok(`${tc.fn} → "${result.subject}" (${result.html.length} chars)`);
    } catch (e) { fail(tc.fn, e.message); }
  }
}

// ─── 3. sendEmail service ────────────────────────────────
async function testSendEmail() {
  console.log('\n📧 3. sendEmail Service\n');

  if (!hasSupabase) {
    skip('sendEmail tests (need Supabase for message logging)');
    return;
  }

  const { sendEmail } = await import('../lib/send-email.js');

  // Test: missing config returns gracefully
  const origKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = '';
  const noConfig = await sendEmail({ to: 'test@test.com', subject: 'Test', html: '<p>Test</p>', context: 'unit_test' });
  process.env.RESEND_API_KEY = origKey;
  if (!noConfig.success && noConfig.error === 'missing config') ok('Missing config returns { success: false }');
  else fail('Missing config', JSON.stringify(noConfig));

  // Test: missing "to" returns gracefully
  const noTo = await sendEmail({ to: '', subject: 'Test', html: '<p>Test</p>', context: 'unit_test' });
  if (!noTo.success) ok('Missing "to" returns { success: false }');
  else fail('Missing to', JSON.stringify(noTo));

  // Live test
  if (isLiveEmail && origKey) {
    console.log(`\n  🔴 LIVE: Sending test email to ${ADMIN_EMAIL}...`);
    const live = await sendEmail({
      to: ADMIN_EMAIL,
      subject: '🧪 Test Notification from test-notifications.js',
      html: '<p>If you received this, <strong>sendEmail</strong> is working correctly.</p>',
      context: 'test_script'
    });
    if (live.success) ok(`Live email sent (id: ${live.id})`);
    else fail('Live email', live.error);
  } else {
    console.log('  ⏭️  Skipping live email (use --live or --live-email)');
  }
}

// ─── 4. sendWhatsApp service ─────────────────────────────
async function testSendWhatsApp() {
  console.log('\n📱 4. sendWhatsApp Service\n');

  if (!hasSupabase) {
    skip('sendWhatsApp tests (need Supabase for message logging)');
    return;
  }

  const { sendWhatsApp } = await import('../lib/send-whatsapp.js');

  // Test: missing config returns gracefully
  const origToken = process.env.WHATSAPP_ACCESS_TOKEN;
  process.env.WHATSAPP_ACCESS_TOKEN = '';
  const noConfig = await sendWhatsApp({ to: '1234567890', textBody: 'Test', context: 'unit_test' });
  process.env.WHATSAPP_ACCESS_TOKEN = origToken;
  if (!noConfig.success && noConfig.error === 'missing config') ok('Missing config returns { success: false }');
  else fail('Missing config', JSON.stringify(noConfig));

  // Test: missing "to" returns gracefully
  const noTo = await sendWhatsApp({ to: '', textBody: 'Test', context: 'unit_test' });
  if (!noTo.success) ok('Missing "to" returns { success: false }');
  else fail('Missing to', JSON.stringify(noTo));

  // Live test — text mode
  if (isLiveWA && origToken && ADMIN_PHONE) {
    console.log(`\n  🔴 LIVE: Sending test WhatsApp to ${ADMIN_PHONE}...`);

    // Text mode
    const liveText = await sendWhatsApp({
      to: ADMIN_PHONE,
      textBody: '🧪 Test from test-notifications.js\n\nIf you received this, sendWhatsApp (text mode) is working.',
      context: 'test_script'
    });
    if (liveText.success) ok('Live WhatsApp text sent');
    else fail('Live WhatsApp text', liveText.error);

    // Template mode (simple)
    const liveTemplate = await sendWhatsApp({
      to: ADMIN_PHONE,
      template: 'item_sold',
      params: ['Test Product', '100'],
      context: 'test_script',
      textPreview: 'Test template: item_sold'
    });
    if (liveTemplate.success) ok('Live WhatsApp template (simple) sent');
    else fail('Live WhatsApp template', liveTemplate.error);

    // Template mode (advanced — with button components like login_code)
    const liveAdvanced = await sendWhatsApp({
      to: ADMIN_PHONE,
      template: 'login_code',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: '999999' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '999999' }] }
      ],
      context: 'test_script',
      textPreview: 'Test template: login_code (advanced)'
    });
    if (liveAdvanced.success) ok('Live WhatsApp template (advanced/button) sent');
    else fail('Live WhatsApp template advanced', liveAdvanced.error);

  } else {
    if (!ADMIN_PHONE) console.log('  ⏭️  Skipping live WhatsApp (set ADMIN_PHONE in .env)');
    else console.log('  ⏭️  Skipping live WhatsApp (use --live or --live-wa)');
  }
}

// ─── 5. Admin test-notification endpoint ─────────────────
async function testAdminEndpoint() {
  console.log('\n🔔 5. Admin test-notification Endpoint\n');

  const API_URL = process.env.VITE_API_URL || 'https://sell.thephirstory.com';

  if (!isLive) {
    console.log('  ⏭️  Skipping live endpoint test (use --live)');
    return;
  }

  // This tests the full flow: admin-listings.js test-notification → sendEmail + sendWhatsApp
  try {
    const res = await fetch(`${API_URL}/api/admin-listings?action=test-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'email',
        email: ADMIN_EMAIL,
        sellerName: 'Test Seller',
        productTitle: 'Test Kurta',
        template: 'item_sold'
      })
    });
    const data = await res.json();
    if (data.success) ok(`Admin endpoint: ${JSON.stringify(data)}`);
    else fail('Admin endpoint', data.error || JSON.stringify(data));
  } catch (e) {
    fail('Admin endpoint', e.message);
  }
}

// ─── Run all ─────────────────────────────────────────────
async function run() {
  console.log('🧪 Notification Services Test Suite');
  console.log(`   Mode: ${mode}`);
  console.log('='.repeat(50));

  await testImports();
  await testTemplates();
  await testSendEmail();
  await testSendWhatsApp();
  await testAdminEndpoint();

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed. Check output above.\n');
    process.exit(1);
  } else if (skipped > 0) {
    console.log('✅ All runnable tests passed! (some skipped — add Supabase keys to .env to run fully)\n');
    process.exit(0);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('💥 Test runner crashed:', err);
  process.exit(1);
});
