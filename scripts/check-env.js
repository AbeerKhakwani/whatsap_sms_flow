#!/usr/bin/env node
// Quick environment variable check for Sunday demo
// Usage: node scripts/check-env.js

import 'dotenv/config';

const required = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'VITE_SHOPIFY_STORE_URL',
  'VITE_SHOPIFY_ACCESS_TOKEN'
];

const optional = [
  'WHATSAPP_VERIFY_TOKEN',
  'OPENAI_API_KEY',
  'TEST_MODE'
];

console.log('🔍 Checking environment variables...\n');

let allGood = true;

console.log('✅ Required:');
for (const key of required) {
  const value = process.env[key];
  if (!value) {
    console.log(`  ❌ ${key} - MISSING`);
    allGood = false;
  } else {
    const masked = value.substring(0, 10) + '...';
    console.log(`  ✅ ${key} = ${masked}`);
  }
}

console.log('\n📝 Optional:');
for (const key of optional) {
  const value = process.env[key];
  if (!value) {
    console.log(`  ⚠️  ${key} - not set`);
  } else {
    const masked = value.length > 10 ? value.substring(0, 10) + '...' : value;
    console.log(`  ✅ ${key} = ${masked}`);
  }
}

console.log('');

if (allGood) {
  console.log('✅ All required environment variables are set!\n');
  process.exit(0);
} else {
  console.log('❌ Some required environment variables are missing.\n');
  console.log('Set them in .env.local or Vercel environment variables.\n');
  process.exit(1);
}
