#!/usr/bin/env node
// Register Shopify webhooks for order events
// Run: node scripts/register-shopify-webhook.js

import 'dotenv/config';

const SHOPIFY_URL = process.env.VITE_SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN;
const WEBHOOK_URL = 'https://sell.thephirstory.com/api/seller?action=order-paid';

const WEBHOOKS_TO_REGISTER = [
  { topic: 'orders/paid', address: WEBHOOK_URL }
];

async function listWebhooks() {
  const response = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/webhooks.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );

  const { webhooks } = await response.json();
  return webhooks || [];
}

async function createWebhook(topic, address) {
  const response = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/webhooks.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN
      },
      body: JSON.stringify({
        webhook: {
          topic,
          address,
          format: 'json'
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create webhook: ${error}`);
  }

  const { webhook } = await response.json();
  return webhook;
}

async function deleteWebhook(id) {
  const response = await fetch(
    `https://${SHOPIFY_URL}/admin/api/2024-10/webhooks/${id}.json`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    }
  );

  return response.ok;
}

async function main() {
  console.log('🔗 Shopify Webhook Registration');
  console.log('================================\n');

  if (!SHOPIFY_URL || !SHOPIFY_TOKEN) {
    console.error('❌ Missing SHOPIFY_URL or SHOPIFY_TOKEN');
    process.exit(1);
  }

  // List existing webhooks
  console.log('📋 Current webhooks:');
  const existing = await listWebhooks();

  if (existing.length === 0) {
    console.log('   (none)\n');
  } else {
    for (const wh of existing) {
      console.log(`   ${wh.topic} → ${wh.address}`);
    }
    console.log('');
  }

  // Register new webhooks
  for (const { topic, address } of WEBHOOKS_TO_REGISTER) {
    const alreadyExists = existing.find(
      wh => wh.topic === topic && wh.address === address
    );

    if (alreadyExists) {
      console.log(`✅ ${topic} already registered`);
      continue;
    }

    // Delete old webhook for same topic if exists
    const oldWebhook = existing.find(wh => wh.topic === topic);
    if (oldWebhook) {
      console.log(`🗑️  Removing old ${topic} webhook...`);
      await deleteWebhook(oldWebhook.id);
    }

    try {
      console.log(`📝 Registering ${topic}...`);
      const webhook = await createWebhook(topic, address);
      console.log(`   ✅ Created webhook ${webhook.id}`);
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
    }
  }

  console.log('\n✨ Done!');
  console.log('\n📌 Next steps:');
  console.log('1. Add SHOPIFY_WEBHOOK_SECRET to .env (from Shopify admin)');
  console.log('2. Run the SQL in scripts/setup-transactions.sql in Supabase');
  console.log('3. Deploy to Vercel: vercel --prod');
}

main().catch(console.error);
