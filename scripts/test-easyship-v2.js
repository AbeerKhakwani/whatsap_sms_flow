// Test Easyship 2024-09 API
// Run with: EASYSHIP_API_KEY=prod_xxx node scripts/test-easyship-v2.js

const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;

if (!EASYSHIP_API_KEY) {
  console.log('Usage: EASYSHIP_API_KEY=your_key node scripts/test-easyship-v2.js');
  process.exit(1);
}

const baseUrl = 'https://public-api.easyship.com';

console.log('Testing Easyship 2024-09 API...');
console.log('API Key prefix:', EASYSHIP_API_KEY.substring(0, 10) + '...');

async function testShipment() {
  try {
    // Try creating a shipment directly
    console.log('\n1. Creating test shipment...');

    const shipmentPayload = {
      origin_address: {
        line_1: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        country_alpha2: 'US',
        contact_name: 'Test Seller',
        contact_phone: '2145551234',
        contact_email: 'test@example.com',
        company_name: 'Test Seller'
      },
      destination_address: {
        line_1: '456 Oak Ave',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        country_alpha2: 'US',
        contact_name: 'Test Buyer',
        contact_phone: '5125559876',
        contact_email: 'buyer@example.com',
        company_name: 'Test Buyer'
      },
      parcels: [{
        box: {
          length: 12,
          width: 9,
          height: 3
        },
        items: [{
          description: 'Pakistani Designer Suit',
          hs_code: '6204430000',
          quantity: 1,
          actual_weight: 0.5,
          declared_currency: 'USD',
          declared_customs_value: 75,
          origin_country_alpha2: 'US'
        }]
      }],
      shipping_settings: {
        output_currency: 'USD'
      }
    };

    const createRes = await fetch(`${baseUrl}/2024-09/shipments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EASYSHIP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shipmentPayload)
    });

    const createData = await createRes.json();
    console.log('Create shipment response:', createRes.status);
    console.log(JSON.stringify(createData, null, 2));

    if (!createRes.ok) {
      console.log('❌ Shipment creation failed');
      return;
    }

    const shipmentId = createData.shipment?.easyship_shipment_id;
    console.log('✅ Shipment created:', shipmentId);

    if (!shipmentId) return;

    // Get rates for the shipment
    console.log('\n2. Getting rates...');
    const ratesRes = await fetch(`${baseUrl}/2024-09/shipments/${shipmentId}/rates`, {
      headers: {
        'Authorization': `Bearer ${EASYSHIP_API_KEY}`
      }
    });

    const ratesData = await ratesRes.json();
    console.log('Rates response:', ratesRes.status);

    if (ratesData.rates && ratesData.rates.length > 0) {
      console.log(`✅ Got ${ratesData.rates.length} rates`);
      ratesData.rates.slice(0, 3).forEach((rate, i) => {
        console.log(`  ${i + 1}. ${rate.courier_name} - $${rate.total_charge} (${rate.min_delivery_time}-${rate.max_delivery_time} days)`);
      });
    } else {
      console.log('No rates:', JSON.stringify(ratesData, null, 2));
    }

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

testShipment();
