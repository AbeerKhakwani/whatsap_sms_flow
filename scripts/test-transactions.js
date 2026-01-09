#!/usr/bin/env node
// Test: Transactions API endpoints
// Run: node scripts/test-transactions.js

import 'dotenv/config';

const API_URL = process.env.VITE_API_URL || 'https://sell.thephirstory.com';

async function test() {
  console.log('=== Test: Transactions API ===\n');
  console.log(`API: ${API_URL}\n`);

  // 1. Get all transactions
  console.log('1. Fetching all transactions...');
  try {
    const res = await fetch(`${API_URL}/api/admin-listings?action=transactions`);
    const data = await res.json();

    if (!data.success) {
      console.log(`   FAILED: ${data.error}`);
      return;
    }

    console.log(`   Total: ${data.transactions?.length || 0} transactions`);
    console.log(`   Pending: ${data.stats?.pendingCount || 0} ($${data.stats?.totalPending?.toFixed(2) || '0.00'})`);
    console.log(`   Paid: ${data.stats?.paidCount || 0} ($${data.stats?.totalPaid?.toFixed(2) || '0.00'})`);

    if (data.transactions?.length > 0) {
      console.log('\n   Recent transactions:');
      data.transactions.slice(0, 3).forEach(tx => {
        console.log(`   - ${tx.order_name || tx.order_id}: ${tx.product_title?.substring(0, 30)}... | $${tx.seller_payout?.toFixed(2)} | ${tx.status}`);
      });
    }
  } catch (error) {
    console.log(`   ERROR: ${error.message}`);
  }

  // 2. Test filtered query
  console.log('\n2. Fetching pending transactions only...');
  try {
    const res = await fetch(`${API_URL}/api/admin-listings?action=transactions&status=pending_payout`);
    const data = await res.json();

    if (!data.success) {
      console.log(`   FAILED: ${data.error}`);
    } else {
      console.log(`   Found ${data.transactions?.length || 0} pending transactions`);
    }
  } catch (error) {
    console.log(`   ERROR: ${error.message}`);
  }

  // 3. Test with seller info
  console.log('\n3. Checking seller data enrichment...');
  try {
    const res = await fetch(`${API_URL}/api/admin-listings?action=transactions`);
    const data = await res.json();

    if (data.success && data.transactions?.length > 0) {
      const withSeller = data.transactions.filter(t => t.seller);
      const withPaypal = data.transactions.filter(t => t.seller?.paypal_email);

      console.log(`   Transactions with seller info: ${withSeller.length}/${data.transactions.length}`);
      console.log(`   Sellers with PayPal: ${withPaypal.length}`);

      if (withSeller.length > 0) {
        const tx = withSeller[0];
        console.log(`\n   Sample seller enrichment:`);
        console.log(`   - Name: ${tx.seller?.name || 'N/A'}`);
        console.log(`   - Email: ${tx.seller?.email || 'N/A'}`);
        console.log(`   - PayPal: ${tx.seller?.paypal_email || 'Not set'}`);
      }
    }
  } catch (error) {
    console.log(`   ERROR: ${error.message}`);
  }

  console.log('\n=== Test Complete ===');
}

test().catch(console.error);
