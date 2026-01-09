#!/usr/bin/env node
// Import sellers from CSV and sync metafields to Shopify products
// Run: node scripts/import-sellers-sync.js sellers.csv [--dry-run]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;
const DEFAULT_COMMISSION = 18;

const DRY_RUN = process.argv.includes('--dry-run');
const csvPath = process.argv.find(arg => arg.endsWith('.csv'));

if (!csvPath) {
  console.log('Usage: node scripts/import-sellers-sync.js sellers.csv [--dry-run]');
  process.exit(1);
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = values[i] || '';
    });
    return row;
  });
}

function cleanPhone(phone) {
  if (!phone) return null;
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 10) return null;
  return cleaned;
}

function parseProductIds(idsString) {
  if (!idsString) return [];
  return idsString.split(',')
    .map(id => id.trim().replace('.0', ''))
    .filter(id => id && id !== '');
}

async function getOrCreateSeller(email, phone, name) {
  // Check if exists
  const { data: existing } = await supabase
    .from('sellers')
    .select('*')
    .ilike('email', email.toLowerCase())
    .maybeSingle();

  if (existing) {
    // Update phone if we have one and they don't
    if (phone && !existing.phone) {
      await supabase
        .from('sellers')
        .update({ phone })
        .eq('id', existing.id);
      existing.phone = phone;
    }
    return { seller: existing, created: false };
  }

  // Create new seller
  // If no phone, use a unique placeholder (DB has NOT NULL + UNIQUE constraint)
  // Placeholder format: NOPHONE-<first8charsOfEmailHash>
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
    console.error(`   ❌ Failed to create seller: ${error.message}`);
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
  // Check if metafield exists
  const existing = await getProductMetafields(productId);
  const existingMf = existing.find(m => m.namespace === namespace && m.key === key);

  if (existingMf) {
    // Update existing
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
    // Create new
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
  console.log('📥 Seller Import & Shopify Sync');
  console.log('================================');
  if (DRY_RUN) console.log('🏃 DRY RUN - No changes will be made\n');

  // Read CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);
  console.log(`📋 Found ${rows.length} rows in CSV\n`);

  let sellersCreated = 0;
  let sellersUpdated = 0;
  let productsUpdated = 0;
  let productsNotFound = 0;
  let errors = 0;

  for (const row of rows) {
    const email = row.user_email;
    const phone = cleanPhone(row.user_phone);
    const productIds = parseProductIds(row.shopify_product_ids);

    if (!email) continue;

    console.log(`\n👤 ${email}`);
    console.log(`   Phone: ${phone || 'none'} | Products: ${productIds.length}`);

    if (DRY_RUN) {
      if (productIds.length > 0) {
        console.log(`   🏃 Would sync ${productIds.length} products`);
      }
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
      console.log(`   ✅ Created seller: ${seller.id}`);
    } else {
      sellersUpdated++;
      console.log(`   ✓ Existing seller: ${seller.id}`);
    }

    // Update product IDs in seller record
    const existingIds = seller.shopify_product_ids || [];
    const newIds = [...new Set([...existingIds, ...productIds])];

    if (newIds.length !== existingIds.length) {
      await supabase
        .from('sellers')
        .update({ shopify_product_ids: newIds })
        .eq('id', seller.id);
      console.log(`   📦 Updated product list: ${existingIds.length} → ${newIds.length}`);
    }

    // Sync metafields for each product
    for (const productId of productIds) {
      const product = await getProduct(productId);
      if (!product) {
        console.log(`   ⚠️  Product ${productId} not found in Shopify`);
        productsNotFound++;
        continue;
      }

      // Get existing metafields to check what needs updating
      const metafields = await getProductMetafields(productId);
      const hasSellerEmail = metafields.some(m => m.namespace === 'seller' && m.key === 'email' && m.value);

      if (hasSellerEmail) {
        console.log(`   ✓ ${product.title.substring(0, 40)}... (already has metafields)`);
        continue;
      }

      // Set seller metafields
      console.log(`   📝 ${product.title.substring(0, 40)}...`);

      await setProductMetafield(productId, 'seller', 'email', email);
      await setProductMetafield(productId, 'seller', 'id', seller.id);
      if (phone) {
        await setProductMetafield(productId, 'seller', 'phone', phone);
      }

      // Set pricing metafields if not present
      const hasCommission = metafields.some(m => m.namespace === 'pricing' && m.key === 'commission_rate');
      if (!hasCommission) {
        const variant = product.variants?.[0];
        const price = parseFloat(variant?.price) || 0;
        const askingPrice = Math.max(0, price - 10); // Remove $10 fee
        const payout = askingPrice * (1 - DEFAULT_COMMISSION / 100);

        await setProductMetafield(productId, 'pricing', 'commission_rate', DEFAULT_COMMISSION.toString(), 'number_integer');
        await setProductMetafield(productId, 'pricing', 'seller_asking_price', askingPrice.toFixed(2), 'number_decimal');
        await setProductMetafield(productId, 'pricing', 'seller_payout', payout.toFixed(2), 'number_decimal');
      }

      productsUpdated++;
      console.log(`      ✅ Metafields set`);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 250));
    }
  }

  console.log('\n================================');
  console.log('📊 Summary:');
  console.log(`   Sellers created: ${sellersCreated}`);
  console.log(`   Sellers updated: ${sellersUpdated}`);
  console.log(`   Products synced: ${productsUpdated}`);
  console.log(`   Products not found: ${productsNotFound}`);
  console.log(`   Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\n🏃 This was a dry run. Run without --dry-run to make changes.');
  }
}

main().catch(console.error);
