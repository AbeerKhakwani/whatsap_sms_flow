#!/usr/bin/env node
/**
 * Manual WhatsApp Flow Tester
 *
 * Usage: npm run test:manual
 *
 * This script helps you manually test the WhatsApp Flow implementation
 * by simulating webhook requests without needing a real WhatsApp number.
 */

import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const TEST_PHONE = '+15555551234';

// Helper functions
function generateSignature(body, secret) {
  return 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
}

function createWhatsAppMessage(from, text) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: from.replace('+', ''),
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Math.floor(Date.now() / 1000),
            type: 'text',
            text: { body: text }
          }]
        }
      }]
    }]
  };
}

function createFlowCompletionMessage(from, data) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: from.replace('+', ''),
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Math.floor(Date.now() / 1000),
            type: 'interactive',
            interactive: {
              type: 'nfm_reply',
              nfm_reply: {
                name: 'flow',
                body: JSON.stringify(data),
                response_json: JSON.stringify(data)
              }
            }
          }]
        }
      }]
    }]
  };
}

async function sendWebhookMessage(payload) {
  const signature = generateSignature(payload, WHATSAPP_APP_SECRET);

  const response = await fetch(`${BASE_URL}/api/sms-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signature
    },
    body: JSON.stringify(payload)
  });

  return response;
}

// Test scenarios
const tests = {
  async testWebhookConnection() {
    console.log('\n🔌 Testing webhook connection...');
    try {
      const message = createWhatsAppMessage(TEST_PHONE, 'START');
      const response = await sendWebhookMessage(message);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Webhook connected:', data);
        return true;
      } else {
        console.error('❌ Webhook failed:', response.status, await response.text());
        return false;
      }
    } catch (error) {
      console.error('❌ Connection error:', error.message);
      return false;
    }
  },

  async testSellCommand() {
    console.log('\n💰 Testing SELL command...');
    try {
      const message = createWhatsAppMessage(TEST_PHONE, 'SELL');
      const response = await sendWebhookMessage(message);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ SELL command processed:', data);
        return true;
      } else {
        console.error('❌ SELL command failed:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      return false;
    }
  },

  async testDescriptionParsing() {
    console.log('\n📝 Testing description parsing...');
    try {
      const description = 'Sana Safinaz 3-piece formal suit, size medium, like new condition, asking $95';
      const message = createWhatsAppMessage(TEST_PHONE, description);
      const response = await sendWebhookMessage(message);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Description parsed:', data);
        return true;
      } else {
        console.error('❌ Parsing failed:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      return false;
    }
  },

  async testFlowCompletion() {
    console.log('\n📋 Testing Flow completion...');
    try {
      const flowData = {
        designer: 'Sana Safinaz',
        pieces: '3-piece',
        style: 'Formal',
        size: 'M',
        condition: 'Like new',
        asking_price: '95',
        color: 'Maroon with gold',
        material: 'Chiffon'
      };

      const message = createFlowCompletionMessage(TEST_PHONE, flowData);
      const response = await sendWebhookMessage(message);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Flow completion processed:', data);
        return true;
      } else {
        console.error('❌ Flow completion failed:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      return false;
    }
  },

  async testFlowEndpoint() {
    console.log('\n🔄 Testing Flow data exchange endpoint...');
    try {
      const payload = {
        action: 'ping',
        flow_token: process.env.WHATSAPP_FLOW_TOKEN
      };

      const signature = generateSignature(payload, WHATSAPP_APP_SECRET);

      const response = await fetch(`${BASE_URL}/api/whatsapp-flow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Flow endpoint active:', data);
        return true;
      } else {
        console.error('❌ Flow endpoint failed:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      return false;
    }
  },

  async testRateLimiting() {
    console.log('\n⏱️  Testing rate limiting...');
    try {
      console.log('Sending 12 rapid messages (limit is 10/min for SELL)...');

      const requests = [];
      for (let i = 0; i < 12; i++) {
        const message = createWhatsAppMessage(TEST_PHONE, 'SELL');
        requests.push(sendWebhookMessage(message));
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(async r => {
        const data = await r.json();
        return data.status === 'rate_limited';
      });

      if (rateLimited.length > 0) {
        console.log('✅ Rate limiting working! Blocked', rateLimited.length, 'requests');
        return true;
      } else {
        console.log('⚠️  Rate limiting may not be active');
        return false;
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      return false;
    }
  }
};

// Main runner
async function runTests() {
  console.log('🧪 WhatsApp Flow Manual Tester\n');
  console.log('Configuration:');
  console.log('  Base URL:', BASE_URL);
  console.log('  Test Phone:', TEST_PHONE);
  console.log('  Has App Secret:', !!WHATSAPP_APP_SECRET);
  console.log('  Has Flow Token:', !!process.env.WHATSAPP_FLOW_TOKEN);

  if (!WHATSAPP_APP_SECRET) {
    console.error('\n❌ Missing WHATSAPP_APP_SECRET in .env.local');
    console.log('Add this to your .env.local file for testing');
    process.exit(1);
  }

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Run all tests
  for (const [name, test] of Object.entries(tests)) {
    results.total++;
    try {
      const passed = await test();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }

      // Wait 500ms between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`\n❌ Test ${name} crashed:`, error);
      results.failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`Total: ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log('='.repeat(50));

  if (results.failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above.');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests, tests };
