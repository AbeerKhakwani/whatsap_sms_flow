#!/usr/bin/env node
// Test: Price update should sync metafields
// Run: node scripts/test-price-update.js <productId> <newPrice>

import 'dotenv/config';

const API_URL = process.env.VITE_API_URL || 'https://sell.thephirstory.com';
const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

const productId = process.argv[2];
const newPrice = process.argv[3];

if (!productId || !newPrice) {
  console.log('Usage: node scripts/test-price-update.js <productId> <newPrice>');
  console.log('Example: node scripts/test-price-update.js 8616082407719 150');
  process.exit(1);
}

async function getMetafields(productId) {
  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  const { metafields } = await res.json();
  return metafields || [];
}

async function getProduct(productId) {
  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  const { product } = await res.json();
  return product;
}

async function test() {
  console.log('=== Test: Price Update Metafield Sync ===\n');

  // 1. Get current state
  console.log('1. Getting current product state...');
  const product = await getProduct(productId);
  if (!product) {
    console.log('   Product not found!');
    process.exit(1);
  }

  const metafieldsBefore = await getMetafields(productId);
  const sellerEmail = metafieldsBefore.find(m => m.namespace === 'seller' && m.key === 'email')?.value;
  const payoutBefore = metafieldsBefore.find(m => m.namespace === 'pricing' && m.key === 'seller_payout')?.value;
  const askingBefore = metafieldsBefore.find(m => m.namespace === 'pricing' && m.key === 'seller_asking_price')?.value;

  console.log(`   Product: ${product.title}`);
  console.log(`   Seller: ${sellerEmail || 'NOT SET'}`);
  console.log(`   Current price: $${product.variants?.[0]?.price}`);
  console.log(`   Asking price metafield: $${askingBefore || 'NOT SET'}`);
  console.log(`   Payout metafield: $${payoutBefore || 'NOT SET'}`);

  if (!sellerEmail) {
    console.log('\n   No seller email on product - cannot test update');
    process.exit(1);
  }

  // 2. Update price via API
  console.log(`\n2. Updating price to $${newPrice} via API...`);
  const updateRes = await fetch(`${API_URL}/api/seller?action=update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: sellerEmail,
      productId,
      price: parseFloat(newPrice)
    })
  });

  const updateData = await updateRes.json();
  if (!updateData.success) {
    console.log(`   FAILED: ${updateData.error}`);
    process.exit(1);
  }
  console.log(`   API Response:`, updateData.listing);

  // 3. Verify metafields updated
  console.log('\n3. Verifying metafields...');

  // Small delay for Shopify to process
  await new Promise(r => setTimeout(r, 1000));

  const metafieldsAfter = await getMetafields(productId);
  const payoutAfter = metafieldsAfter.find(m => m.namespace === 'pricing' && m.key === 'seller_payout')?.value;
  const askingAfter = metafieldsAfter.find(m => m.namespace === 'pricing' && m.key === 'seller_asking_price')?.value;

  // Expected values (use product's commission rate, $10 fee)
  const commissionRate = parseFloat(metafieldsAfter.find(m => m.namespace === 'pricing' && m.key === 'commission_rate')?.value) || 18;
  const expectedAsking = Math.max(0, parseFloat(newPrice) - 10);
  const expectedPayout = expectedAsking * (1 - commissionRate / 100);

  console.log(`   Expected asking: $${expectedAsking.toFixed(2)}`);
  console.log(`   Actual asking:   $${askingAfter}`);
  console.log(`   Expected payout: $${expectedPayout.toFixed(2)}`);
  console.log(`   Actual payout:   $${payoutAfter}`);

  // 4. Result
  const askingMatch = Math.abs(parseFloat(askingAfter) - expectedAsking) < 0.01;
  const payoutMatch = Math.abs(parseFloat(payoutAfter) - expectedPayout) < 0.01;

  console.log('\n=== RESULT ===');
  if (askingMatch && payoutMatch) {
    console.log('✅ PASS - Metafields correctly synced!');
  } else {
    console.log('❌ FAIL - Metafields not synced correctly');
    if (!askingMatch) console.log(`   Asking price mismatch`);
    if (!payoutMatch) console.log(`   Payout mismatch`);
  }
}

test().catch(console.error);
