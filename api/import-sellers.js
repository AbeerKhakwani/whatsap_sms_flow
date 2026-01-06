// api/import-sellers.js
// Import sellers from CSV data with full product history

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const LISTING_FEE = 10;

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

  const { action } = req.query;

  // SYNC METAFIELDS - Update Shopify products with pricing metafields from CSV
  if (action === 'sync-metafields') {
    return handleSyncMetafields(req, res);
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

/**
 * Sync Shopify product metafields from CSV data
 * Updates: seller.id, pricing.commission_rate, pricing.seller_asking_price, pricing.seller_payout
 */
async function handleSyncMetafields(req, res) {
  try {
    const { productsCsv } = req.body;

    if (!productsCsv) {
      return res.status(400).json({ error: 'productsCsv is required' });
    }

    const products = parse(productsCsv, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true
    });

    console.log(`Syncing metafields for ${products.length} products`);

    const shopifyUrl = process.env.VITE_SHOPIFY_STORE_URL;
    const shopifyToken = process.env.VITE_SHOPIFY_ACCESS_TOKEN;

    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const product of products) {
      const shopifyId = product.shopifyId;

      // Skip if no Shopify ID
      if (!shopifyId || shopifyId === '' || isNaN(parseInt(shopifyId))) {
        skipped++;
        continue;
      }

      try {
        const retailPrice = parseFloat(product.retailPrice) || 0;
        const splitForCustomer = parseFloat(product.splitForCustomer) || 50;
        const clientId = product.client || '';

        // Calculate pricing
        // splitForCustomer = seller's percentage (e.g., 50 means seller gets 50%)
        // Our commission = 100 - splitForCustomer
        const ourCommission = 100 - splitForCustomer;
        const sellerAskingPrice = Math.max(0, retailPrice - LISTING_FEE);
        const sellerPayout = sellerAskingPrice * (splitForCustomer / 100);

        // Build metafields array
        const metafields = [
          {
            namespace: 'seller',
            key: 'id',
            value: clientId.toString(),
            type: 'single_line_text_field'
          },
          {
            namespace: 'pricing',
            key: 'commission_rate',
            value: ourCommission.toString(),
            type: 'number_integer'
          },
          {
            namespace: 'pricing',
            key: 'seller_asking_price',
            value: sellerAskingPrice.toFixed(2),
            type: 'number_decimal'
          },
          {
            namespace: 'pricing',
            key: 'seller_payout',
            value: sellerPayout.toFixed(2),
            type: 'number_decimal'
          }
        ];

        // Update product metafields
        const updateRes = await fetch(
          `https://${shopifyUrl}/admin/api/2024-10/products/${shopifyId}.json`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopifyToken
            },
            body: JSON.stringify({
              product: {
                id: shopifyId,
                metafields
              }
            })
          }
        );

        if (!updateRes.ok) {
          const errText = await updateRes.text();
          errors.push(`${shopifyId}: ${errText.slice(0, 100)}`);
          continue;
        }

        // Get the product to find inventory item ID for cost update
        const productData = await updateRes.json();
        const variant = productData.product?.variants?.[0];

        if (variant?.inventory_item_id) {
          // Update inventory item cost (seller payout)
          const costRes = await fetch(
            `https://${shopifyUrl}/admin/api/2024-10/inventory_items/${variant.inventory_item_id}.json`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': shopifyToken
              },
              body: JSON.stringify({
                inventory_item: {
                  id: variant.inventory_item_id,
                  cost: sellerPayout.toFixed(2)
                }
              })
            }
          );

          if (!costRes.ok) {
            console.log(`Warning: Could not set cost for ${shopifyId}`);
          }
        }

        synced++;
        console.log(`Synced ${shopifyId}: commission=${ourCommission}%, asking=$${sellerAskingPrice}, payout=$${sellerPayout}`);

      } catch (err) {
        errors.push(`${shopifyId}: ${err.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      synced,
      skipped,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Sync metafields error:', error);
    return res.status(500).json({ error: error.message });
  }
}
