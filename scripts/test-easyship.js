// Quick test script for Easyship API
// Run with: EASYSHIP_API_KEY=prod_xxx node scripts/test-easyship.js

const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;

if (!EASYSHIP_API_KEY) {
  console.log('Usage: EASYSHIP_API_KEY=your_key node scripts/test-easyship.js');
  process.exit(1);
}

const isSandbox = EASYSHIP_API_KEY.startsWith('sand_');
const baseUrl = isSandbox
  ? 'https://public-api-sandbox.easyship.com'
  : 'https://api.easyship.com';

console.log(`Testing Easyship ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} API...`);
console.log(`Base URL: ${baseUrl}`);

async function testConnection() {
  try {
    // Test: Get rates for a test shipment
    console.log('\n1. Testing rate fetch...');
    const ratesRes = await fetch(`${baseUrl}/2024-09/rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EASYSHIP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        origin_address: {
          line_1: '123 Test St',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country_alpha2: 'US',
          contact_name: 'Test Seller',
          contact_phone: '5551234567'
        },
        destination_address: {
          line_1: '456 Buyer Ave',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
          country_alpha2: 'US',
          contact_name: 'Test Buyer',
          contact_phone: '5559876543'
        },
        parcels: [{
          total_actual_weight: 0.5,
          items: [{
            description: 'Test Clothing Item',
            quantity: 1,
            actual_weight: 0.5,
            declared_currency: 'USD',
            declared_customs_value: 50
          }]
        }],
        shipping_settings: {
          output_currency: 'USD'
        }
      })
    });

    const ratesData = await ratesRes.json();
    console.log('Rates response status:', ratesRes.status);

    if (ratesData.rates && ratesData.rates.length > 0) {
      console.log(`✅ Got ${ratesData.rates.length} shipping rates`);
      console.log('Cheapest rate:', ratesData.rates[0]?.courier_name, '$' + ratesData.rates[0]?.total_charge);
    } else {
      console.log('Rates response:', JSON.stringify(ratesData, null, 2));
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

testConnection();
