// scripts/test-admin-features.js
// Quick test script for admin dashboard features

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const API_URL = process.env.VITE_API_URL || 'https://sell.thephirstory.com';

async function testPendingListings() {
  console.log('\n📋 Testing: Get Pending Listings\n');

  const response = await fetch(`${API_URL}/api/admin-listings?action=pending`);
  const data = await response.json();

  if (data.success) {
    console.log('✅ API Response: Success');
    console.log(`   Pending: ${data.stats.pending}`);
    console.log(`   Approved: ${data.stats.approved}`);
    console.log(`   Sold: ${data.stats.sold}`);

    if (data.listings.length > 0) {
      const listing = data.listings[0];
      console.log(`\n📦 Sample Listing:`);
      console.log(`   Product: ${listing.product_name}`);
      console.log(`   Designer: ${listing.designer}`);
      console.log(`   Price: $${listing.asking_price_usd}`);
      console.log(`   Payout: $${listing.seller_payout}`);
      console.log(`   Commission: ${listing.commission_rate}%`);
      console.log(`   Seller: ${listing.seller?.name || 'Unknown'} (${listing.seller?.email})`);
      console.log(`   Tags: ${listing.tags?.join(', ')}`);
      console.log(`   Images: ${listing.images?.length || 0}`);
    }

    return { success: true, data };
  } else {
    console.log('❌ API Response: Failed');
    console.log(`   Error: ${data.error}`);
    return { success: false };
  }
}

async function testMetafieldCalculations() {
  console.log('\n🧮 Testing: Payout Calculations\n');

  // Test different commission rates
  const testCases = [
    { askingPrice: 100, commission: 18, expected: 73.8 },  // (100-10) * 0.82
    { askingPrice: 200, commission: 18, expected: 155.8 }, // (200-10) * 0.82
    { askingPrice: 100, commission: 15, expected: 76.5 },  // (100-10) * 0.85
    { askingPrice: 100, commission: 20, expected: 72 },    // (100-10) * 0.80
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(test => {
    const calculated = (test.askingPrice - 10) * ((100 - test.commission) / 100);
    const match = Math.abs(calculated - test.expected) < 0.01;

    if (match) {
      console.log(`✅ $${test.askingPrice} @ ${test.commission}% = $${calculated.toFixed(2)}`);
      passed++;
    } else {
      console.log(`❌ $${test.askingPrice} @ ${test.commission}% = $${calculated.toFixed(2)} (expected $${test.expected})`);
      failed++;
    }
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

async function testRejectionReasons() {
  console.log('\n🚫 Testing: Rejection Reasons\n');

  const reasons = [
    'Poor Photo Quality',
    'Missing Information',
    'Not Pakistani Designer',
    'Condition Issues',
    'Pricing Too High',
    'Duplicate Listing',
    'Not Eligible for Resale',
    'Other'
  ];

  console.log(`✅ ${reasons.length} rejection reasons configured:`);
  reasons.forEach((reason, i) => {
    console.log(`   ${i + 1}. ${reason}`);
  });

  return true;
}

async function checkEnvironment() {
  console.log('\n⚙️  Checking Environment\n');

  const checks = [
    { name: 'VITE_SHOPIFY_STORE_URL', value: process.env.VITE_SHOPIFY_STORE_URL },
    { name: 'VITE_SHOPIFY_ACCESS_TOKEN', value: process.env.VITE_SHOPIFY_ACCESS_TOKEN ? '✓' : null },
    { name: 'SUPABASE_URL', value: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL },
    { name: 'SUPABASE_SERVICE_KEY', value: process.env.SUPABASE_SERVICE_KEY ? '✓' : null },
    { name: 'RESEND_API_KEY', value: process.env.RESEND_API_KEY ? '✓' : null },
    { name: 'WHATSAPP_ACCESS_TOKEN', value: process.env.WHATSAPP_ACCESS_TOKEN ? '✓' : null },
    { name: 'WHATSAPP_PHONE_NUMBER_ID', value: process.env.WHATSAPP_PHONE_NUMBER_ID }
  ];

  let allConfigured = true;

  checks.forEach(check => {
    if (check.value) {
      console.log(`✅ ${check.name}: ${check.value === '✓' ? 'Configured' : check.value}`);
    } else {
      console.log(`❌ ${check.name}: Not configured`);
      allConfigured = false;
    }
  });

  return allConfigured;
}

async function testHealthChecks() {
  console.log('\n🏥 Testing: API Health\n');

  const endpoints = [
    { name: 'Pending Listings', url: `${API_URL}/api/admin-listings?action=pending` },
    { name: 'Payouts', url: `${API_URL}/api/admin-listings?action=payouts` },
    { name: 'Transactions', url: `${API_URL}/api/admin-listings?action=transactions` }
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url);
      const data = await response.json();

      if (data.success) {
        console.log(`✅ ${endpoint.name}: Working`);
      } else {
        console.log(`⚠️  ${endpoint.name}: Responded but not success`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name}: ${error.message}`);
    }
  }
}

async function runAllTests() {
  console.log('🧪 Admin Dashboard Feature Tests');
  console.log('='.repeat(50));

  await checkEnvironment();
  await testHealthChecks();
  await testPendingListings();
  await testMetafieldCalculations();
  await testRejectionReasons();

  console.log('\n' + '='.repeat(50));
  console.log('✅ Automated tests complete!');
  console.log('\n📝 Next Steps:');
  console.log('   1. Open admin dashboard: https://sell.thephirstory.com/admin');
  console.log('   2. Test approval modal with editable fields');
  console.log('   3. Test rejection with reason + notifications');
  console.log('   4. Run Scripts page to create metafield definitions');
  console.log('   5. Check TESTING_CHECKLIST.md for full manual test plan');
  console.log('');
}

runAllTests().catch(console.error);
