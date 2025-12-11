#!/usr/bin/env node
// tests/simulator.js
// Headless SMS simulator - run conversation flows from CLI
// Usage: node tests/simulator.js [--flow <name>] [--phone <number>] [--url <endpoint>]

import fetch from 'node-fetch';
import readline from 'readline';

// ═══════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════
const DEFAULT_URL = 'https://phirstory-dashboard.vercel.app/api/sms-webhook';
const DEFAULT_PHONE = '+15551234567';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// ═══════════════════════════════════════
// PREDEFINED TEST FLOWS
// ═══════════════════════════════════════
const FLOWS = {
  'new-user': {
    name: 'New User Creates Account',
    messages: [
      { send: 'hi', expect: ['account', 'YES', 'NO'] },
      { send: 'no', expect: ['create', 'email'] },
      { send: 'testuser@example.com', expect: ['created', 'Welcome'] },
      { send: 'sell', expect: ['item listed', 'photos'] }
    ]
  },
  
  'returning-user': {
    name: 'Returning User Links Phone',
    setup: 'Requires existing account with email: returning@test.com',
    messages: [
      { send: 'hello', expect: ['account', 'YES', 'NO'] },
      { send: 'yes', expect: ['email', 'signed up'] },
      { send: 'returning@test.com', expect: ['Welcome back', 'linked'] }
    ]
  },
  
  'global-commands': {
    name: 'Global Commands (HELP, STOP, START, MENU)',
    messages: [
      { send: 'help', expect: ['Help', 'SELL', 'BUY', 'STOP'] },
      { send: 'stop', expect: ['unsubscribed'] },
      { send: 'sell', expect: ['unsubscribed', 'START'] },
      { send: 'start', expect: ['Welcome'] },
      { send: 'menu', expect: ['What would you like'] }
    ]
  },
  
  'error-handling': {
    name: 'Error Handling (Wrong Emails)',
    messages: [
      { send: 'hi', expect: ['account', 'YES', 'NO'] },
      { send: 'yes', expect: ['email'] },
      { send: 'wrong1@test.com', expect: ['Attempt 1/3'] },
      { send: 'wrong2@test.com', expect: ['Attempt 2/3'] },
      { send: 'wrong3@test.com', expect: ['Too many', 'start over'] }
    ]
  },
  
  'gibberish': {
    name: 'Gibberish Handling',
    messages: [
      { send: 'asdfghjkl', expect: [] },
      { send: '!!!???', expect: [] },
      { send: '12345', expect: [] },
      { send: '🎉👋🔥', expect: [] }
    ]
  },
  
  'sell-flow': {
    name: 'Authorized User - Sell Flow',
    setup: 'Requires authorized user',
    messages: [
      { send: 'sell', expect: ['item listed', 'photos'] },
      { send: '1', expect: [] }, // Photos option
      { send: 'menu', expect: ['What would you like'] }
    ]
  },
  
  'buy-flow': {
    name: 'Authorized User - Buy Flow',
    setup: 'Requires authorized user',
    messages: [
      { send: 'buy', expect: ['browse', 'thephirstory.com'] },
      { send: 'I want a Sana Safinaz', expect: [] }
    ]
  },
  
  'natural-language': {
    name: 'Natural Language Intent Detection',
    setup: 'Requires authorized user',
    messages: [
      { send: 'I want to sell my dress', expect: ['item listed'] },
      { send: 'menu', expect: ['What would you like'] },
      { send: 'Can I see what you have?', expect: ['browse'] },
      { send: 'menu', expect: ['What would you like'] },
      { send: 'What am I selling?', expect: ['listings'] }
    ]
  }
};

// ═══════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════
function log(color, prefix, message) {
  console.log(`${color}${prefix}${COLORS.reset} ${message}`);
}

function extractMessage(xml) {
  const match = xml.match(/<Message>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Message>/);
  return match ? match[1].trim() : null;
}

async function sendMessage(url, phone, message) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: phone, Body: message })
  });
  
  const text = await response.text();
  return {
    status: response.status,
    raw: text,
    message: extractMessage(text)
  };
}

function checkExpectations(response, expectations) {
  if (!expectations || expectations.length === 0) return { passed: true, results: [] };
  
  const results = expectations.map(exp => ({
    expected: exp,
    found: response.includes(exp)
  }));
  
  const passed = results.every(r => r.found);
  return { passed, results };
}

// ═══════════════════════════════════════
// RUN PREDEFINED FLOW
// ═══════════════════════════════════════
async function runFlow(flowName, url, phone) {
  const flow = FLOWS[flowName];
  if (!flow) {
    log(COLORS.red, '❌', `Unknown flow: ${flowName}`);
    log(COLORS.dim, '  ', `Available flows: ${Object.keys(FLOWS).join(', ')}`);
    return;
  }
  
  console.log('\n' + '═'.repeat(50));
  log(COLORS.cyan, '🧪', `Running: ${flow.name}`);
  if (flow.setup) log(COLORS.yellow, '⚠️ ', flow.setup);
  console.log('═'.repeat(50) + '\n');
  
  let allPassed = true;
  
  for (let i = 0; i < flow.messages.length; i++) {
    const step = flow.messages[i];
    
    log(COLORS.green, '📤', `Sending: "${step.send}"`);
    
    try {
      const response = await sendMessage(url, phone, step.send);
      
      if (response.status !== 200) {
        log(COLORS.red, '❌', `HTTP ${response.status}`);
        allPassed = false;
        continue;
      }
      
      log(COLORS.blue, '📥', `Received: "${response.message?.substring(0, 100)}..."`);
      
      const check = checkExpectations(response.message || '', step.expect);
      
      if (check.passed) {
        log(COLORS.green, '✅', 'Expectations met');
      } else {
        log(COLORS.red, '❌', 'Expectations failed:');
        check.results.forEach(r => {
          const icon = r.found ? '✓' : '✗';
          const color = r.found ? COLORS.green : COLORS.red;
          log(color, `   ${icon}`, `"${r.expected}"`);
        });
        allPassed = false;
      }
      
      console.log('');
      
      // Small delay between messages
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      log(COLORS.red, '❌', `Error: ${err.message}`);
      allPassed = false;
    }
  }
  
  console.log('═'.repeat(50));
  if (allPassed) {
    log(COLORS.green, '✅', 'FLOW PASSED');
  } else {
    log(COLORS.red, '❌', 'FLOW FAILED');
  }
  console.log('═'.repeat(50) + '\n');
  
  return allPassed;
}

// ═══════════════════════════════════════
// RUN ALL FLOWS
// ═══════════════════════════════════════
async function runAllFlows(url, phone) {
  console.log('\n' + '═'.repeat(50));
  log(COLORS.cyan, '🧪', 'Running ALL test flows');
  console.log('═'.repeat(50) + '\n');
  
  const results = {};
  
  for (const flowName of Object.keys(FLOWS)) {
    results[flowName] = await runFlow(flowName, url, phone);
    
    // Wait between flows
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  log(COLORS.cyan, '📊', 'SUMMARY');
  console.log('═'.repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  for (const [name, result] of Object.entries(results)) {
    if (result) {
      log(COLORS.green, '✅', name);
      passed++;
    } else {
      log(COLORS.red, '❌', name);
      failed++;
    }
  }
  
  console.log('═'.repeat(50));
  log(COLORS.bright, '  ', `Passed: ${passed}/${passed + failed}`);
  console.log('═'.repeat(50) + '\n');
  
  return failed === 0;
}

// ═══════════════════════════════════════
// INTERACTIVE MODE
// ═══════════════════════════════════════
async function interactiveMode(url, phone) {
  console.log('\n' + '═'.repeat(50));
  log(COLORS.cyan, '💬', 'Interactive SMS Simulator');
  log(COLORS.dim, '  ', `Endpoint: ${url}`);
  log(COLORS.dim, '  ', `Phone: ${phone}`);
  log(COLORS.dim, '  ', 'Type messages to send. Commands: /quit, /flows, /run <flow>');
  console.log('═'.repeat(50) + '\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const prompt = () => {
    rl.question(`${COLORS.green}You: ${COLORS.reset}`, async (input) => {
      input = input.trim();
      
      if (!input) {
        prompt();
        return;
      }
      
      // Commands
      if (input === '/quit' || input === '/exit') {
        console.log('Bye!');
        rl.close();
        return;
      }
      
      if (input === '/flows') {
        console.log('\nAvailable flows:');
        for (const [name, flow] of Object.entries(FLOWS)) {
          log(COLORS.cyan, `  ${name}:`, flow.name);
        }
        console.log('');
        prompt();
        return;
      }
      
      if (input.startsWith('/run ')) {
        const flowName = input.slice(5).trim();
        await runFlow(flowName, url, phone);
        prompt();
        return;
      }
      
      if (input === '/all') {
        await runAllFlows(url, phone);
        prompt();
        return;
      }
      
      // Regular message
      try {
        const response = await sendMessage(url, phone, input);
        
        if (response.status !== 200) {
          log(COLORS.red, 'Error:', `HTTP ${response.status}`);
        } else {
          console.log(`${COLORS.blue}Bot: ${COLORS.reset}${response.message}\n`);
        }
      } catch (err) {
        log(COLORS.red, 'Error:', err.message);
      }
      
      prompt();
    });
  };
  
  prompt();
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let url = DEFAULT_URL;
  let phone = DEFAULT_PHONE;
  let flow = null;
  let runAll = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      url = args[++i];
    } else if (args[i] === '--phone' && args[i + 1]) {
      phone = args[++i];
    } else if (args[i] === '--flow' && args[i + 1]) {
      flow = args[++i];
    } else if (args[i] === '--all') {
      runAll = true;
    } else if (args[i] === '--help') {
      console.log(`
SMS Webhook Simulator

Usage:
  node tests/simulator.js [options]

Options:
  --url <endpoint>   API endpoint (default: ${DEFAULT_URL})
  --phone <number>   Test phone number (default: ${DEFAULT_PHONE})
  --flow <name>      Run specific test flow
  --all              Run all test flows
  --help             Show this help

Available flows:
${Object.entries(FLOWS).map(([name, f]) => `  ${name.padEnd(20)} ${f.name}`).join('\n')}

Examples:
  node tests/simulator.js                    # Interactive mode
  node tests/simulator.js --flow new-user    # Run specific flow
  node tests/simulator.js --all              # Run all flows
  node tests/simulator.js --url http://localhost:3000/api/sms-webhook  # Custom URL
`);
      return;
    }
  }
  
  if (runAll) {
    const success = await runAllFlows(url, phone);
    process.exit(success ? 0 : 1);
  } else if (flow) {
    const success = await runFlow(flow, url, phone);
    process.exit(success ? 0 : 1);
  } else {
    await interactiveMode(url, phone);
  }
}

main().catch(console.error);
