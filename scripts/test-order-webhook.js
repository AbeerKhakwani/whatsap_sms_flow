#!/usr/bin/env node
/**
 * Test script: simulate a Shopify orders/paid webhook locally.
 *
 * Usage:
 *   node scripts/test-order-webhook.js [product_id]
 *
 * The product_id should be a real Shopify product ID that has seller metafields.
 * If omitted, uses the TEST_PRODUCT_ID env var or a placeholder (which will
 * still exercise the webhook flow but log "seller not found").
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. .env.local present with SHOPIFY_WEBHOOK_SECRET
 */

import crypto from 'crypto';
import { config } from 'dotenv';

// Load local env
config({ path: '.env.local' });

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const TARGET_URL = process.argv[3] || 'http://localhost:3000/api/order-webhook';
const PRODUCT_ID  = parseInt(process.argv[2] || process.env.TEST_PRODUCT_ID || '9999999999', 10);

// ─── Build a realistic fake order ────────────────────────────────────────────
const fakeOrder = {
  id: Date.now(),           // unique order id each run
  name: `#TEST-${Date.now().toString().slice(-4)}`,
  email: 'test-buyer@example.com',
  financial_status: 'paid',
  total_price: '120.00',
  subtotal_price: '120.00',
  total_tax: '0.00',
  currency: 'CAD',
  created_at: new Date().toISOString(),
  shipping_address: {
    name: 'Test Buyer',
    address1: '123 Test St',
    address2: '',
    city: 'Toronto',
    province_code: 'ON',
    zip: 'M5V 0N4',
    country_code: 'CA',
    phone: '+16471234567'
  },
  line_items: [
    {
      id: Date.now() + 1,
      product_id: PRODUCT_ID,
      title: 'Test Listing (webhook test)',
      quantity: 1,
      price: '120.00',
      sku: 'TEST-SKU-001',
      image: null
    }
  ],
  customer: {
    id: 123456,
    email: 'test-buyer@example.com',
    first_name: 'Test',
    last_name: 'Buyer'
  }
};

const body = JSON.stringify(fakeOrder);

// ─── Compute HMAC ─────────────────────────────────────────────────────────
let hmac = '';
if (WEBHOOK_SECRET) {
  hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('base64');
  console.log('✅  HMAC computed with SHOPIFY_WEBHOOK_SECRET');
} else {
  console.warn('⚠️  SHOPIFY_WEBHOOK_SECRET not set — webhook will skip HMAC check');
}

// ─── Fire the request ─────────────────────────────────────────────────────
console.log(`\n🚀  Sending fake orders/paid webhook to ${TARGET_URL}`);
console.log(`    Order ID : ${fakeOrder.id}`);
console.log(`    Order #  : ${fakeOrder.name}`);
console.log(`    Product  : ${PRODUCT_ID}`);
console.log(`    Amount   : $${fakeOrder.total_price}\n`);

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Topic': 'orders/paid',
  'X-Shopify-Shop-Domain': 'thephirstory.myshopify.com',
  'X-Shopify-Webhook-Id': crypto.randomUUID(),
};
if (hmac) headers['X-Shopify-Hmac-Sha256'] = hmac;

fetch(TARGET_URL, { method: 'POST', headers, body })
  .then(async r => {
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (r.ok) {
      console.log(`✅  Webhook accepted (${r.status})`);
      console.log(JSON.stringify(json, null, 2));
    } else {
      console.error(`❌  Webhook rejected (${r.status})`);
      console.error(JSON.stringify(json, null, 2));
    }
  })
  .catch(err => {
    console.error('❌  Request failed:', err.message);
    console.error('    Is the dev server running? (npm run dev)');
  });
