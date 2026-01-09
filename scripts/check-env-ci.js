#!/usr/bin/env node
// Environment check for CI/CD - exits with error code if vars missing

const required = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'VITE_SHOPIFY_STORE_URL',
  'VITE_SHOPIFY_ACCESS_TOKEN'
];

console.log('🔍 Checking CI environment variables...\n');

let missing = [];

for (const key of required) {
  const value = process.env[key];
  if (!value) {
    console.log(`  ❌ ${key} - MISSING`);
    missing.push(key);
  } else {
    const masked = value.substring(0, 10) + '***';
    console.log(`  ✅ ${key} = ${masked}`);
  }
}

console.log('');

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\nAdd them to GitHub Secrets:');
  console.error('https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions\n');
  process.exit(1);
} else {
  console.log('✅ All required environment variables are set!\n');
  process.exit(0);
}
