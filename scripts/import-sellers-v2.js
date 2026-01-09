#!/usr/bin/env node
// Import sellers and sync metafields using Circle Hand CSV as source of truth
// Run: node scripts/import-sellers-v2.js [--dry-run]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;
const DEFAULT_COMMISSION = 18;

const DRY_RUN = process.argv.includes('--dry-run');

const SELLERS_CSV = 'scripts/sellers-import.csv';
const PRODUCTS_CSV = '/Users/ak/Downloads/The_Phir_Story_items_ Circle_ Hand - The_Phir_Story_items.csv';

function cleanPhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 10) return null;
  return cleaned;
}

async function getOrCreateSeller(email, phone, name) {
  // Check if exists by email
  const { data: existing } = await supabase
    .from('sellers')
    .select('*')
    .ilike('email', email.toLowerCase())
    .maybeSingle();

  if (existing) {
    // Update phone if we have one and they don't (or theirs is a placeholder)
    if (phone && (!existing.phone || existing.phone.startsWith('NOPHONE-'))) {
      await supabase
        .from('sellers')
        .update({ phone })
        .eq('id', existing.id);
      existing.phone = phone;
    }
    return { seller: existing, created: false };
  }

  // Create new seller
  // Use unique placeholder if no phone (DB has NOT NULL + UNIQUE constraint)
  let finalPhone = phone;
  if (!finalPhone) {
    const hash = email.toLowerCase().split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    finalPhone = `NOPHONE-${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }

  const newSeller = {
    email: email.toLowerCase(),
    phone: finalPhone,
    name: name || email.split('@')[0],
    commission_rate: DEFAULT_COMMISSION,
    shopify_product_ids: []
  };

  const { data: created, error } = await supabase
    .from('sellers')
    .insert(newSeller)
    .select()
    .single();

  if (error) {
    console.error(`   Failed to create seller: ${error.message}`);
    return { seller: null, created: false };
  }

  return { seller: created, created: true };
}

async function getProductMetafields(productId) {
  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  if (!res.ok) return [];
  const { metafields } = await res.json();
  return metafields || [];
}

async function setProductMetafield(productId, namespace, key, value, type = 'single_line_text_field') {
  const existing = await getProductMetafields(productId);
  const existingMf = existing.find(m => m.namespace === namespace && m.key === key);

  if (existingMf) {
    const res = await fetch(
      `https://${SHOPIFY_URL}/admin/api/2024-10/metafields/${existingMf.id}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_TOKEN
        },
        body: JSON.stringify({
          metafield: { id: existingMf.id, value: value.toString() }
        })
      }
    );
    return res.ok;
  } else {
    const res = await fetch(
      `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}/metafields.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_TOKEN
        },
        body: JSON.stringify({
          metafield: { namespace, key, value: value.toString(), type }
        })
      }
    );
    return res.ok;
  }
}

async function getProduct(productId) {
  const res = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/products/${productId}.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  if (!res.ok) return null;
  const { product } = await res.json();
  return product;
}

async function main() {
  console.log('Seller Import v2 - Using Circle Hand as Source of Truth');
  console.log('=========================================================');
  if (DRY_RUN) console.log('DRY RUN - No changes will be made\n');

  // Read sellers CSV to get email/phone by user_id
  const sellersContent = fs.readFileSync(SELLERS_CSV, 'utf-8');
  const sellersData = parse(sellersContent, { columns: true, skip_empty_lines: true });

  const sellersByUserId = {};
  for (const row of sellersData) {
    const userId = row.user_id;
    if (userId && !sellersByUserId[userId]) {
      sellersByUserId[userId] = {
        email: row.user_email,
        phone: cleanPhone(row.user_phone)
      };
    }
  }
  console.log(`Loaded ${Object.keys(sellersByUserId).length} seller profiles\n`);

  // Read Circle Hand CSV to get product -> client mapping
  const productsContent = fs.readFileSync(PRODUCTS_CSV, 'utf-8');
  const productsData = parse(productsContent, { columns: true, skip_empty_lines: true });

  const productsByClient = {};
  for (const row of productsData) {
    const client = row.client;
    const shopifyId = row.shopifyId;
    if (client && shopifyId) {
      if (!productsByClient[client]) {
        productsByClient[client] = [];
      }
      productsByClient[client].push({
        shopifyId,
        title: row.title,
        retailPrice: parseFloat(row.retailPrice) || 0,
        splitForCustomer: parseFloat(row.splitForCustomer) || 50
      });
    }
  }
  console.log(`Found ${Object.keys(productsByClient).length} clients with products\n`);

  let sellersCreated = 0;
  let sellersUpdated = 0;
  let productsUpdated = 0;
  let productsNotFound = 0;
  let errors = 0;

  // Process each client
  for (const [clientId, products] of Object.entries(productsByClient).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const sellerInfo = sellersByUserId[clientId];
    if (!sellerInfo) {
      console.log(`\nClient ${clientId}: No seller info found, skipping ${products.length} products`);
      errors++;
      continue;
    }

    const { email, phone } = sellerInfo;
    console.log(`\nClient ${clientId}: ${email}`);
    console.log(`   Phone: ${phone || 'none'} | Products: ${products.length}`);

    if (DRY_RUN) {
      console.log(`   Would sync ${products.length} products`);
      continue;
    }

    // Get or create seller
    const { seller, created } = await getOrCreateSeller(email, phone);
    if (!seller) {
      errors++;
      continue;
    }

    if (created) {
      sellersCreated++;
      console.log(`   Created seller: ${seller.id}`);
    } else {
      sellersUpdated++;
      console.log(`   Existing seller: ${seller.id}`);
    }

    // Update product IDs in seller record
    const productIds = products.map(p => p.shopifyId);
    const existingIds = seller.shopify_product_ids || [];
    const newIds = [...new Set([...existingIds, ...productIds])];

    if (newIds.length !== existingIds.length) {
      await supabase
        .from('sellers')
        .update({ shopify_product_ids: newIds })
        .eq('id', seller.id);
      console.log(`   Updated product list: ${existingIds.length} -> ${newIds.length}`);
    }

    // Sync metafields for each product
    for (const productInfo of products) {
      const { shopifyId, title, retailPrice, splitForCustomer } = productInfo;

      const product = await getProduct(shopifyId);
      if (!product) {
        console.log(`   [NOT FOUND] ${shopifyId}`);
        productsNotFound++;
        continue;
      }

      // Get existing metafields
      const metafields = await getProductMetafields(shopifyId);
      const currentSellerEmail = metafields.find(m => m.namespace === 'seller' && m.key === 'email')?.value;

      // Check if metafields need updating (wrong seller or missing)
      if (currentSellerEmail && currentSellerEmail.toLowerCase() === email.toLowerCase()) {
        console.log(`   [OK] ${title.substring(0, 40)}...`);
        continue;
      }

      if (currentSellerEmail && currentSellerEmail.toLowerCase() !== email.toLowerCase()) {
        console.log(`   [FIX] ${title.substring(0, 35)}... (was: ${currentSellerEmail})`);
      } else {
        console.log(`   [NEW] ${title.substring(0, 40)}...`);
      }

      // Set seller metafields
      await setProductMetafield(shopifyId, 'seller', 'email', email);
      await setProductMetafield(shopifyId, 'seller', 'id', seller.id);
      if (phone) {
        await setProductMetafield(shopifyId, 'seller', 'phone', phone);
      }

      // Set pricing metafields
      const commissionRate = 100 - splitForCustomer; // splitForCustomer is seller's cut
      const askingPrice = Math.max(0, retailPrice - 10); // Remove $10 fee
      const payout = askingPrice * (splitForCustomer / 100);

      await setProductMetafield(shopifyId, 'pricing', 'commission_rate', commissionRate.toString(), 'number_integer');
      await setProductMetafield(shopifyId, 'pricing', 'seller_asking_price', askingPrice.toFixed(2), 'number_decimal');
      await setProductMetafield(shopifyId, 'pricing', 'seller_payout', payout.toFixed(2), 'number_decimal');

      productsUpdated++;

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log('\n=========================================================');
  console.log('Summary:');
  console.log(`   Sellers created: ${sellersCreated}`);
  console.log(`   Sellers updated: ${sellersUpdated}`);
  console.log(`   Products synced: ${productsUpdated}`);
  console.log(`   Products not found: ${productsNotFound}`);
  console.log(`   Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to make changes.');
  }
}

main().catch(console.error);
