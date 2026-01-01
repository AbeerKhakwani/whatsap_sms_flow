#!/usr/bin/env node
// scripts/import-sellers.js
// Import sellers from CSV files into Supabase with full product data

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load env from project root
dotenv.config({ path: path.join(process.cwd(), '.env.production') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// File paths - update these to match your files
const CLIENTS_CSV = '/Users/ak/Downloads/clients_csv - clients (1).csv';
const PRODUCTS_CSV = '/Users/ak/Downloads/The_Phir_Story_items_ Circle_ Hand - The_Phir_Story_items (3).csv';

async function importSellers() {
  console.log('Reading CSV files...\n');

  // Read clients with relaxed parsing
  const clientsRaw = fs.readFileSync(CLIENTS_CSV, 'utf-8');
  const clients = parse(clientsRaw, { columns: true, skip_empty_lines: true, relax_quotes: true });
  console.log(`Found ${clients.length} clients`);

  // Read products with relaxed parsing
  const productsRaw = fs.readFileSync(PRODUCTS_CSV, 'utf-8');
  const products = parse(productsRaw, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  console.log(`Found ${products.length} products\n`);

  // Create a map of clientId -> client info
  const clientMap = new Map();
  for (const client of clients) {
    clientMap.set(client.clientId, {
      id: client.clientId,
      email: client.email?.toLowerCase()?.trim(),
      firstName: client.firstName?.trim(),
      lastName: client.lastName?.trim(),
      phone: client.phone?.trim(),
      notes: client.notes?.trim()
    });
  }

  // Group products by client - store FULL product data (not just shopifyId)
  const productsByClient = new Map();
  for (const product of products) {
    const clientId = product.client;

    // Skip products with invalid client IDs
    if (!clientId || clientId.includes('<') || isNaN(parseInt(clientId))) continue;

    if (!productsByClient.has(clientId)) {
      productsByClient.set(clientId, []);
    }

    // Store full product info
    const retailPrice = parseFloat(product.retailPrice) || 0;
    const splitForCustomer = parseFloat(product.splitForCustomer) || 50;
    const sellerEarnings = retailPrice * (splitForCustomer / 100);

    productsByClient.get(clientId).push({
      title: product.title,
      shopifyId: product.shopifyId || null,
      sku: product.sku || null,
      status: product.inventoryStatus || 'UNKNOWN',
      retailPrice,
      splitPercent: splitForCustomer,
      sellerEarnings,
      dateSold: product.dateSold || null,
      handInDate: product.handInDate || null,
      brand: product.brands || null,
      condition: product.condition || null,
      compensationType: product.compensationType || 'CONSIGNMENT'
    });
  }

  console.log(`Products grouped by ${productsByClient.size} clients\n`);

  // Import to Supabase
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [clientId, clientProducts] of productsByClient) {
    const client = clientMap.get(clientId);

    if (!client || !client.email) {
      console.log(`Skipping client ${clientId} - no email found`);
      skipped++;
      continue;
    }

    // Calculate stats for this seller
    const inStock = clientProducts.filter(p => p.status === 'IN_STOCK').length;
    const sold = clientProducts.filter(p => p.status.includes('SOLD')).length;
    const totalEarnings = clientProducts
      .filter(p => p.status.includes('SOLD'))
      .reduce((sum, p) => sum + p.sellerEarnings, 0);
    const pendingPayout = clientProducts
      .filter(p => p.status === 'SOLD_WITHOUT_PAYOUT')
      .reduce((sum, p) => sum + p.sellerEarnings, 0);

    // Determine typical commission rate (most common split)
    const splits = clientProducts.map(p => p.splitPercent);
    const commissionRate = splits.length > 0
      ? splits.sort((a,b) => splits.filter(v => v===a).length - splits.filter(v => v===b).length).pop()
      : 50;

    // Extract shopify IDs for backward compatibility
    const shopifyIds = clientProducts
      .filter(p => p.shopifyId)
      .map(p => p.shopifyId);

    // Check if seller already exists
    const { data: existing } = await supabase
      .from('sellers')
      .select('*')
      .eq('email', client.email)
      .single();

    const sellerData = {
      name: client.firstName ? `${client.firstName} ${client.lastName || ''}`.trim() : null,
      phone: client.phone || null,
      shopify_product_ids: shopifyIds,
      products: clientProducts,
      commission_rate: commissionRate,
      total_earnings: totalEarnings,
      pending_payout: pendingPayout
    };

    if (existing) {
      // Merge existing products with new ones (by shopifyId or title)
      const existingProducts = existing.products || [];
      const existingIds = new Set(existingProducts.map(p => p.shopifyId || p.title));

      for (const newProduct of clientProducts) {
        const key = newProduct.shopifyId || newProduct.title;
        if (!existingIds.has(key)) {
          existingProducts.push(newProduct);
        }
      }

      sellerData.products = existingProducts;
      sellerData.shopify_product_ids = [...new Set([
        ...(existing.shopify_product_ids || []),
        ...shopifyIds
      ])];

      const { error } = await supabase
        .from('sellers')
        .update(sellerData)
        .eq('id', existing.id);

      if (error) {
        console.error(`Error updating ${client.email}:`, error.message);
      } else {
        console.log(`Updated ${client.email} - ${clientProducts.length} products (${sold} sold, $${totalEarnings.toFixed(0)} earned)`);
        updated++;
      }
    } else {
      // Create new seller
      const { error } = await supabase
        .from('sellers')
        .insert({
          email: client.email,
          ...sellerData
        });

      if (error) {
        console.error(`Error creating ${client.email}:`, error.message);
      } else {
        console.log(`Created ${client.email} - ${clientProducts.length} products (${sold} sold, $${totalEarnings.toFixed(0)} earned)`);
        created++;
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total sellers with products: ${created + updated}`);
}

importSellers().catch(console.error);
