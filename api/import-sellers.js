// api/import-sellers.js
// Import sellers from CSV data with full product history

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { clientsCsv, productsCsv } = req.body;

    if (!clientsCsv || !productsCsv) {
      return res.status(400).json({ error: 'Both clientsCsv and productsCsv are required' });
    }

    // Parse CSVs with relaxed options
    const clients = parse(clientsCsv, { columns: true, skip_empty_lines: true, relax_quotes: true });
    const products = parse(productsCsv, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

    console.log(`Parsed ${clients.length} clients and ${products.length} products`);

    // Create client map (clientId -> client info)
    const clientMap = new Map();
    for (const client of clients) {
      clientMap.set(client.clientId, {
        id: client.clientId,
        email: client.email?.toLowerCase()?.trim(),
        firstName: client.firstName?.trim(),
        lastName: client.lastName?.trim(),
        phone: client.phone?.trim()
      });
    }

    // Group products by client - store FULL product data
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

    // Import to Supabase
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const [clientId, clientProducts] of productsByClient) {
      const client = clientMap.get(clientId);

      if (!client || !client.email) {
        skipped++;
        continue;
      }

      try {
        // Calculate stats for this seller
        const soldProducts = clientProducts.filter(p => p.status?.includes('SOLD'));
        const totalEarnings = soldProducts.reduce((sum, p) => sum + p.sellerEarnings, 0);
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
          const existingKeys = new Set(existingProducts.map(p => p.shopifyId || p.title));

          for (const newProduct of clientProducts) {
            const key = newProduct.shopifyId || newProduct.title;
            if (!existingKeys.has(key)) {
              existingProducts.push(newProduct);
            }
          }

          sellerData.products = existingProducts;
          sellerData.shopify_product_ids = [...new Set([
            ...(existing.shopify_product_ids || []),
            ...shopifyIds
          ])];

          // Preserve existing name/phone if not in new data
          if (!sellerData.name) sellerData.name = existing.name;
          if (!sellerData.phone) sellerData.phone = existing.phone;

          const { error } = await supabase
            .from('sellers')
            .update(sellerData)
            .eq('id', existing.id);

          if (error) {
            errors.push(`${client.email}: ${error.message}`);
          } else {
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
            errors.push(`${client.email}: ${error.message}`);
          } else {
            created++;
          }
        }
      } catch (err) {
        errors.push(`${client.email}: ${err.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      created,
      updated,
      skipped,
      total: created + updated,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({ error: error.message });
  }
}
