#!/usr/bin/env node
// Backfill script: Create transaction records for sold items
//
// Usage:
//   node scripts/backfill-transactions.js [--dry-run]           # Check inventory for sold items
//   node scripts/backfill-transactions.js --orders [--dry-run]  # Fetch from Shopify orders
//   node scripts/backfill-transactions.js --orders --days=14    # Last 14 days of orders

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

const DRY_RUN = process.argv.includes('--dry-run');
const USE_ORDERS = process.argv.includes('--orders');
const DAYS_ARG = process.argv.find(a => a.startsWith('--days='));
const DAYS = DAYS_ARG ? parseInt(DAYS_ARG.split('=')[1]) : 14;

async function fetchShopifyProduct(productId) {
  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  if (!res.ok) return null;
  const { product } = await res.json();
  return product;
}

async function fetchProductMetafields(productId) {
  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  if (!res.ok) return [];
  const { metafields } = await res.json();
  return metafields || [];
}

// ============= ORDER-BASED BACKFILL =============

async function fetchRecentOrders(days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  console.log(`Fetching orders since ${sinceISO}...`);

  const url = `https://${SHOPIFY_URL}/admin/api/2024-10/orders.json?status=any&created_at_min=${sinceISO}&limit=250`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
  });

  const { orders } = await res.json();
  console.log(`Found ${orders?.length || 0} orders\n`);
  return orders || [];
}

async function transactionExists(orderId, productId) {
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('order_id', orderId.toString())
    .eq('product_id', productId.toString())
    .maybeSingle();
  return !!data;
}

async function findSeller(email, id) {
  if (id) {
    const { data } = await supabase.from('sellers').select('*').eq('id', id).single();
    if (data) return data;
  }
  if (email) {
    const { data } = await supabase.from('sellers').select('*').ilike('email', email.toLowerCase()).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function backfillFromOrders() {
  console.log('🔄 Backfill from Shopify Orders');
  console.log('================================');
  console.log(`Days: ${DAYS}`);
  if (DRY_RUN) console.log('🏃 DRY RUN - No changes will be made\n');

  const orders = await fetchRecentOrders(DAYS);

  // Filter to only paid orders
  const paidOrders = orders.filter(o =>
    o.financial_status === 'paid' || o.financial_status === 'partially_paid'
  );
  console.log(`${paidOrders.length} paid orders to process\n`);

  let created = 0;
  let skipped = 0;
  let noSeller = 0;

  for (const order of paidOrders) {
    console.log(`\n📦 Order ${order.name} (${order.created_at.split('T')[0]}) - $${order.total_price}`);

    for (const item of order.line_items || []) {
      const productId = item.product_id;
      if (!productId) {
        console.log(`   ⚠️  ${item.title}: No product ID`);
        continue;
      }

      // Check if transaction already exists
      const exists = await transactionExists(order.id, productId);
      if (exists) {
        console.log(`   ✓ ${item.title}: Already exists`);
        skipped++;
        continue;
      }

      // Get product metafields
      const metafields = await fetchProductMetafields(productId);

      // Extract seller info
      let sellerEmail = null;
      let sellerId = null;
      let sellerPayout = null;
      let commissionRate = 18;

      for (const mf of metafields) {
        if (mf.namespace === 'seller' && mf.key === 'email') sellerEmail = mf.value;
        if (mf.namespace === 'seller' && mf.key === 'id') sellerId = mf.value;
        if (mf.namespace === 'pricing' && mf.key === 'seller_payout') sellerPayout = parseFloat(mf.value);
        if (mf.namespace === 'pricing' && mf.key === 'commission_rate') commissionRate = parseFloat(mf.value);
      }

      if (!sellerEmail && !sellerId) {
        console.log(`   ⚠️  ${item.title}: No seller metafields`);
        noSeller++;
        continue;
      }

      // Find seller
      const seller = await findSeller(sellerEmail, sellerId);
      if (!seller) {
        console.log(`   ⚠️  ${item.title}: Seller not found (${sellerEmail || sellerId})`);
        noSeller++;
        continue;
      }

      // Calculate payout if not in metafields
      const salePrice = parseFloat(item.price);
      if (!sellerPayout) {
        sellerPayout = salePrice * ((100 - commissionRate) / 100);
      }

      if (DRY_RUN) {
        console.log(`   🏃 ${item.title}: Would create for ${seller.name || seller.email} ($${sellerPayout.toFixed(2)})`);
        created++;
        continue;
      }

      // Create transaction
      const transaction = {
        seller_id: seller.id,
        order_id: order.id.toString(),
        order_name: order.name,
        product_id: productId.toString(),
        product_title: item.title,
        sale_price: salePrice,
        seller_payout: sellerPayout,
        commission_rate: commissionRate,
        status: 'pending_payout',
        customer_email: order.email,
        created_at: order.created_at
      };

      const { error } = await supabase.from('transactions').insert(transaction);

      if (error) {
        console.log(`   ❌ ${item.title}: ${error.message}`);
      } else {
        console.log(`   ✅ ${item.title}: Created for ${seller.name || seller.email} ($${sellerPayout.toFixed(2)})`);
        created++;
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log('\n================================');
  console.log('📊 Summary:');
  console.log(`   Created: ${created}`);
  console.log(`   Already existed: ${skipped}`);
  console.log(`   No seller found: ${noSeller}`);

  if (DRY_RUN) {
    console.log('\n🏃 Run without --dry-run to create transactions.');
  }
}

// ============= INVENTORY-BASED BACKFILL =============

async function main() {
  if (USE_ORDERS) {
    return backfillFromOrders();
  }

  console.log('🔄 Backfill Transactions Script (Inventory Check)');
  console.log('================================');
  if (DRY_RUN) console.log('🏃 DRY RUN - No changes will be made\n');

  // 1. Get all sellers with product IDs
  const { data: sellers, error: sellersError } = await supabase
    .from('sellers')
    .select('id, name, email, shopify_product_ids, commission_rate');

  if (sellersError) {
    console.error('❌ Error fetching sellers:', sellersError);
    return;
  }

  console.log(`📋 Found ${sellers.length} sellers\n`);

  let totalSold = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const seller of sellers) {
    const productIds = seller.shopify_product_ids || [];
    if (productIds.length === 0) continue;

    console.log(`\n👤 ${seller.name || seller.email}`);
    console.log(`   Products: ${productIds.length}`);

    for (const productId of productIds) {
      // Fetch product from Shopify
      const product = await fetchShopifyProduct(productId);
      if (!product) {
        console.log(`   ⚠️  Product ${productId} not found in Shopify`);
        continue;
      }

      const variant = product.variants?.[0] || {};
      const inventory = variant.inventory_quantity ?? 0;
      const isSold = inventory === 0 && product.status === 'active';
      const isArchived = product.status === 'archived';

      if (!isSold && !isArchived) continue;

      totalSold++;
      console.log(`   📦 SOLD: ${product.title}`);

      // Check if transaction already exists
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('product_id', productId.toString())
        .maybeSingle();

      if (existingTx) {
        console.log(`      ✓ Transaction exists`);
        totalSkipped++;
        continue;
      }

      // Fetch metafields for pricing info
      const metafields = await fetchProductMetafields(productId);
      let commissionRate = seller.commission_rate || 18;
      let sellerAskingPrice = null;
      let sellerPayout = null;

      for (const mf of metafields) {
        if (mf.namespace === 'pricing' && mf.key === 'commission_rate') {
          commissionRate = parseFloat(mf.value) || commissionRate;
        }
        if (mf.namespace === 'pricing' && mf.key === 'seller_asking_price') {
          sellerAskingPrice = parseFloat(mf.value);
        }
        if (mf.namespace === 'pricing' && mf.key === 'seller_payout') {
          sellerPayout = parseFloat(mf.value);
        }
      }

      // Calculate if not in metafields
      const salePrice = parseFloat(variant.price) || 0;
      if (sellerAskingPrice === null) {
        sellerAskingPrice = Math.max(0, salePrice - 10);
      }
      if (sellerPayout === null) {
        sellerPayout = sellerAskingPrice * ((100 - commissionRate) / 100);
      }

      console.log(`      Sale: $${salePrice} | Payout: $${sellerPayout.toFixed(2)} | Commission: ${commissionRate}%`);

      if (DRY_RUN) {
        console.log(`      🏃 Would create transaction`);
        totalCreated++;
        continue;
      }

      // Create transaction
      const transaction = {
        seller_id: seller.id,
        order_id: `BACKFILL-${productId}`,
        order_name: `#BACKFILL`,
        product_id: productId.toString(),
        product_title: product.title,
        sale_price: salePrice,
        seller_payout: sellerPayout,
        commission_rate: commissionRate,
        status: 'pending_payout',
        customer_email: null,
        created_at: product.updated_at || new Date().toISOString()
      };

      const { error: txError } = await supabase
        .from('transactions')
        .insert(transaction);

      if (txError) {
        console.log(`      ❌ Error: ${txError.message}`);
        totalErrors++;
      } else {
        console.log(`      ✅ Created transaction`);
        totalCreated++;
      }
    }
  }

  console.log('\n================================');
  console.log('📊 Summary:');
  console.log(`   Sold items found: ${totalSold}`);
  console.log(`   Transactions created: ${totalCreated}`);
  console.log(`   Already existed: ${totalSkipped}`);
  console.log(`   Errors: ${totalErrors}`);

  if (DRY_RUN) {
    console.log('\n🏃 This was a dry run. Run without --dry-run to create transactions.');
  }
}

main().catch(console.error);
