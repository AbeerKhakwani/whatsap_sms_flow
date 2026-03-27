// scripts/test-shippo.js
// Quick test to verify Shippo API key works and can get rates
//
// Usage: node scripts/test-shippo.js
//
// This does NOT buy a label — just validates the API key and fetches rates.

import 'dotenv/config';

const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY;

if (!SHIPPO_API_KEY) {
  console.error('❌ SHIPPO_API_KEY not set in .env or .env.local');
  process.exit(1);
}

const isTest = SHIPPO_API_KEY.includes('test');
console.log(`📦 Shippo mode: ${isTest ? 'TEST' : 'PRODUCTION'}`);
console.log(`📦 Key prefix: ${SHIPPO_API_KEY.substring(0, 15)}...`);

// Step 1: Validate API key
console.log('\n--- Step 1: Validate API key ---');
try {
  const res = await fetch('https://api.goshippo.com/addresses/', {
    method: 'POST',
    headers: {
      'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Test Seller',
      street1: '123 Test Street',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      country: 'US',
      validate: true
    })
  });

  const addr = await res.json();
  if (!res.ok) {
    console.error('❌ API key invalid:', addr.detail || JSON.stringify(addr));
    process.exit(1);
  }
  console.log('✅ API key valid');
  console.log(`   Address validation: ${addr.validation_results?.is_valid ? 'VALID' : 'INVALID'}`);
} catch (err) {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
}

// Step 2: Create test shipment and get rates (no purchase)
console.log('\n--- Step 2: Get shipping rates ---');
try {
  const res = await fetch('https://api.goshippo.com/shipments/', {
    method: 'POST',
    headers: {
      'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      address_from: {
        name: 'Test Seller',
        street1: '123 Test St',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        country: 'US'
      },
      address_to: {
        name: 'Test Buyer',
        street1: '456 Main Ave',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US'
      },
      parcels: [{
        length: 12,
        width: 9,
        height: 3,
        distance_unit: 'in',
        weight: 1,
        mass_unit: 'lb'
      }],
      async: false
    })
  });

  const shipment = await res.json();

  if (!res.ok) {
    console.error('❌ Shipment creation failed:', shipment.detail || JSON.stringify(shipment));
    process.exit(1);
  }

  const rates = shipment.rates || [];
  const uspsRates = rates.filter(r => r.provider === 'USPS');

  console.log(`✅ Got ${rates.length} rates (${uspsRates.length} USPS)`);
  console.log('\n   USPS rates:');
  for (const rate of uspsRates.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))) {
    const days = rate.estimated_days ? `${rate.estimated_days}d` : '?d';
    console.log(`   • $${rate.amount} — ${rate.servicelevel?.name || rate.servicelevel?.token} (${days})`);
  }

  if (shipment.messages?.length) {
    console.log('\n   Warnings:', shipment.messages.map(m => m.text).join(', '));
  }

  console.log('\n✅ Shippo is working! Ready to generate labels.');
  if (isTest) {
    console.log('   (Test mode — labels will be dummy PDFs, no real postage)');
  }

} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
