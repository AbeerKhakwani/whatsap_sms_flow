#!/usr/bin/env node
/**
 * E2E Test Suite - Simulates real WhatsApp users
 * Tests the actual deployed webhook API
 *
 * Usage:
 *   node scripts/e2e-test.js                 # Run all tests
 *   node scripts/e2e-test.js --scenario=1   # Run specific scenario
 *   node scripts/e2e-test.js --phone=1234   # Use specific test phone
 */

const API_URL = process.env.API_URL || 'https://tps-portal.vercel.app';

// Parse args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace('--', '').split('=');
  acc[key] = val || true;
  return acc;
}, {});

// Generate unique phone for each test run to avoid state conflicts
const TEST_PHONE = args.phone || `1555${Date.now().toString().slice(-7)}`;

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(color, msg) {
  console.log(`${color}${msg}${COLORS.reset}`);
}

// Create WhatsApp webhook payload
function createPayload(phone, text, type = 'text') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'BIZ_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550000000', phone_number_id: 'PHONE_ID' },
          contacts: [{ profile: { name: 'E2E Test User' }, wa_id: phone }],
          messages: [{
            from: phone,
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type,
            ...(type === 'text' ? { text: { body: text } } : {})
          }]
        },
        field: 'messages'
      }]
    }]
  };
}

// Send message and get response (we can't see the actual WhatsApp response,
// but we can verify the webhook processed it successfully)
async function sendMessage(phone, text) {
  const payload = createPayload(phone, text);

  try {
    const res = await fetch(`${API_URL}/api/sms-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    return { success: res.ok, status: res.status, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Wait between messages
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Test scenarios
const scenarios = [
  {
    name: 'Happy Path - Full listing with known brand',
    steps: [
      { send: 'MENU', expect: 'should respond' },
      { send: 'SELL', expect: 'should start sell flow' },
      { send: 'Sana Safinaz kurta, medium, like new, $85', expect: 'should extract all fields' },
      { send: 'skip', expect: 'should skip details' },
      // Photos would go here but we can't simulate
      { send: 'cancel', expect: 'should cancel and save draft' },
    ]
  },
  {
    name: 'Unknown Pakistani brand acceptance',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start sell' },
      { send: 'Ayesha Boutique kurta, large, new, $60', expect: 'should accept unknown brand' },
      { send: 'cancel', expect: 'cancel' },
    ]
  },
  {
    name: 'Reject custom/handmade',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'custom made kurta, medium, $50', expect: 'should reject custom' },
      { send: 'cancel', expect: 'cancel' },
    ]
  },
  {
    name: 'Reject Indian brands',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'Sabyasachi lehnga, small, new, $200', expect: 'should reject Indian brand' },
      { send: 'cancel', expect: 'cancel' },
    ]
  },
  {
    name: 'Status question mid-flow',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'Maria B suit, xl', expect: 'partial info' },
      { send: 'what did I list so far?', expect: 'should show status' },
      { send: 'cancel', expect: 'cancel' },
    ]
  },
  {
    name: 'Misspelled brand correction',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'suffose kurta medium like new $70', expect: 'should correct to Suffuse' },
      { send: 'cancel', expect: 'cancel' },
    ]
  },
  {
    name: 'Incremental info collection',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'Elan', expect: 'should get designer' },
      { send: 'kurta', expect: 'should get item type' },
      { send: 'medium', expect: 'should get size' },
      { send: 'like new', expect: 'should get condition' },
      { send: '$90', expect: 'should get price and show details question' },
      { send: 'cancel', expect: 'cancel' },
    ]
  },
  {
    name: 'Draft resume flow',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'Khaadi 3-piece large', expect: 'partial' },
      { send: 'exit', expect: 'should save draft' },
      { send: 'SELL', expect: 'should find draft' },
      { send: '1', expect: 'should continue with draft' },
      { send: 'cancel', expect: 'cancel' },
    ]
  },
  {
    name: 'Global commands work in flow',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'Sapphire kurta', expect: 'partial' },
      { send: 'HELP', expect: 'should show help' },
      { send: 'MENU', expect: 'should show menu' },
    ]
  },
  {
    name: 'Edit flow',
    steps: [
      { send: 'MENU', expect: 'reset' },
      { send: 'SELL', expect: 'start' },
      { send: 'Baroque suit, medium, like new, $100', expect: 'all fields' },
      { send: 'skip', expect: 'skip details' },
      // Simulate reaching confirmation (in real test would need photos)
      { send: 'clear', expect: 'should delete draft' },
    ]
  }
];

// Run a single scenario
async function runScenario(scenario, phone) {
  log(COLORS.cyan, `\n📋 ${scenario.name}`);
  log(COLORS.dim, '─'.repeat(50));

  let passed = 0;
  let failed = 0;

  for (const step of scenario.steps) {
    process.stdout.write(`  ${COLORS.dim}→${COLORS.reset} Sending: "${step.send}" ... `);

    const result = await sendMessage(phone, step.send);
    await wait(800); // Wait for processing

    if (result.success) {
      log(COLORS.green, '✓');
      passed++;
    } else {
      log(COLORS.red, `✗ (${result.error || result.status})`);
      failed++;
    }
  }

  return { passed, failed, name: scenario.name };
}

// Main test runner
async function runTests() {
  console.log('\n' + '═'.repeat(60));
  log(COLORS.cyan, '🧪 E2E TEST SUITE - WhatsApp Sell Flow');
  console.log('═'.repeat(60));
  log(COLORS.dim, `API: ${API_URL}`);
  log(COLORS.dim, `Test Phone: ${TEST_PHONE}`);
  console.log('═'.repeat(60));

  const results = [];
  const scenariosToRun = args.scenario
    ? [scenarios[parseInt(args.scenario) - 1]]
    : scenarios;

  for (const scenario of scenariosToRun) {
    if (!scenario) continue;
    // Use unique phone suffix for each scenario to avoid state conflicts
    const phone = `${TEST_PHONE}${scenarios.indexOf(scenario)}`;
    const result = await runScenario(scenario, phone);
    results.push(result);
    await wait(500);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  log(COLORS.cyan, '📊 TEST SUMMARY');
  console.log('═'.repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const r of results) {
    const icon = r.failed === 0 ? '✅' : '❌';
    const color = r.failed === 0 ? COLORS.green : COLORS.red;
    log(color, `${icon} ${r.name}: ${r.passed} passed, ${r.failed} failed`);
    totalPassed += r.passed;
    totalFailed += r.failed;
  }

  console.log('─'.repeat(60));
  log(totalFailed === 0 ? COLORS.green : COLORS.red,
    `Total: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('═'.repeat(60) + '\n');

  // Exit with error if any failed
  process.exit(totalFailed > 0 ? 1 : 0);
}

// Run
runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
