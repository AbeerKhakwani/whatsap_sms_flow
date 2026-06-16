// lib/shipping.js
// Shipping label generation for sellers

// Business warehouse address (where sellers ship items TO)
const WAREHOUSE_ADDRESS = {
  name: 'The Phir Story',
  street1: process.env.WAREHOUSE_ADDRESS_LINE1 || '123 Main St',
  street2: process.env.WAREHOUSE_ADDRESS_LINE2 || '',
  city: process.env.WAREHOUSE_CITY || 'New York',
  state: process.env.WAREHOUSE_STATE || 'NY',
  zip: process.env.WAREHOUSE_ZIP || '10001',
  country: 'US',
  phone: process.env.WAREHOUSE_PHONE || ''
};

/**
 * Generate a USPS QR code URL for package drop-off
 * This creates a Label Broker ID that can be scanned at USPS
 *
 * Note: For production, integrate with:
 * - USPS Web Tools API (free but requires registration)
 * - EasyPost API (pay per label)
 * - Shippo API (pay per label)
 */
export function generateUSPSQRCode(trackingNumber) {
  // USPS Label Broker URL format - scans at post office kiosks
  return `https://tools.usps.com/label-broker/label-image?labelBrokerId=${trackingNumber}`;
}

/**
 * Format address for display
 */
export function formatAddress(address) {
  const lines = [
    address.name,
    address.street1,
    address.street2,
    `${address.city}, ${address.state} ${address.zip}`
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Generate a shipping label request object
 * This would be sent to a shipping API (USPS/EasyPost/Shippo)
 */
export function createLabelRequest(seller, productTitle) {
  if (!seller.address_line1 || !seller.city || !seller.state || !seller.zip) {
    throw new Error('Seller address incomplete. Please update your profile with full address.');
  }

  return {
    from_address: {
      name: seller.name,
      street1: seller.address_line1,
      street2: seller.address_line2 || '',
      city: seller.city,
      state: seller.state,
      zip: seller.zip,
      country: 'US',
      phone: seller.phone || ''
    },
    to_address: WAREHOUSE_ADDRESS,
    parcel: {
      length: 12,
      width: 9,
      height: 3,
      weight: 16, // 1 lb default for clothing
      predefined_package: 'USPS_PRIORITY_FLAT_RATE_PADDED_ENVELOPE'
    },
    service: 'USPS_PRIORITY',
    reference: productTitle?.slice(0, 50) || 'Consignment Item'
  };
}

/**
 * Generate shipping instructions message
 */
export function getShippingInstructions(seller, productTitle) {
  const warehouseFormatted = formatAddress(WAREHOUSE_ADDRESS);

  return `📦 Shipping Instructions for "${productTitle}"

Ship your item to:
${warehouseFormatted}

Tips:
• Use a padded envelope or small box
• Include a note with your name: ${seller.name || seller.email}
• Take a photo of the receipt/tracking

We'll notify you when we receive it!`;
}

/**
 * Generate a simple QR code URL using a free service
 * This creates a QR code image that contains the tracking URL
 */
export function generateTrackingQR(trackingNumber) {
  const trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
  // Using Google Charts API for QR generation (free)
  return `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(trackingUrl)}`;
}

/**
 * Calculate estimated shipping cost (for display only)
 */
export function estimateShippingCost(weight = 16, zone = 'local') {
  // USPS Priority Mail rough estimates
  const rates = {
    local: 8.50,    // Zones 1-2
    regional: 10.50, // Zones 3-4
    national: 14.50  // Zones 5-8
  };

  return rates[zone] || rates.regional;
}

/**
 * Create Easyship label (if API key configured)
 * Returns label URL and tracking number
 */
export async function createEasyshipLabel(seller, productTitle, buyerAddress) {
  const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;

  if (!EASYSHIP_API_KEY) {
    throw new Error('Easyship API key not configured');
  }

  // Detect sandbox vs production
  const isSandbox = EASYSHIP_API_KEY.startsWith('sand_');
  const baseUrl = isSandbox
    ? 'https://public-api-sandbox.easyship.com'
    : 'https://public-api.easyship.com';

  console.log(`📦 Using Easyship ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} API`);
  console.log(`📦 API Key prefix: ${EASYSHIP_API_KEY.substring(0, 10)}...`);
  console.log(`📦 Base URL: ${baseUrl}`);

  // Easyship API - Create shipment and get label
  const response = await fetch(`${baseUrl}/2024-09/shipments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EASYSHIP_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      origin_address: {
        line_1: seller.address_line1,
        line_2: seller.address_line2 || '',
        city: seller.city,
        state: seller.state,
        postal_code: seller.zip,
        country_alpha2: 'US',
        contact_name: seller.name,
        contact_phone: seller.phone || '',
        company_name: seller.name
      },
      destination_address: {
        line_1: buyerAddress.street1,
        line_2: buyerAddress.street2 || '',
        city: buyerAddress.city,
        state: buyerAddress.state,
        postal_code: buyerAddress.zip,
        country_alpha2: buyerAddress.country || 'US',
        contact_name: buyerAddress.name,
        contact_phone: buyerAddress.phone || '',
        company_name: buyerAddress.name || 'Customer'
      },
      parcels: [{
        box: {
          length: 12,
          width: 9,
          height: 3
        },
        items: [{
          description: productTitle?.slice(0, 100) || 'Pakistani Designer Suit',
          hs_code: '6204430000',  // Women's dresses/suits of synthetic fibers
          quantity: 1,
          actual_weight: 0.5,  // 0.5 kg default for clothing
          declared_currency: 'USD',
          declared_customs_value: 75,
          origin_country_alpha2: 'US'
        }]
      }],
      shipping_settings: {
        output_currency: 'USD'
      }
    })
  });

  const data = await response.json();

  console.log('📦 Easyship response status:', response.status);
  console.log('📦 Easyship response:', JSON.stringify(data, null, 2));

  if (!response.ok || data.error) {
    const errorMsg = data.error?.message || data.message || data.errors?.[0]?.message || 'Failed to create Easyship shipment';
    console.error('📦 Easyship error details:', JSON.stringify(data));
    throw new Error(errorMsg);
  }

  // Get rates and buy cheapest
  const shipmentId = data.shipment?.easyship_shipment_id;

  if (!shipmentId) {
    throw new Error('No shipment ID returned');
  }

  // Get rates
  const ratesRes = await fetch(`${baseUrl}/2024-09/shipments/${shipmentId}/rates`, {
    headers: {
      'Authorization': `Bearer ${EASYSHIP_API_KEY}`
    }
  });

  const ratesData = await ratesRes.json();
  const rates = ratesData.rates || [];

  if (rates.length === 0) {
    throw new Error('No shipping rates available');
  }

  // Find cheapest USPS rate or just cheapest
  const uspsRate = rates.find(r => r.courier_name?.includes('USPS')) || rates[0];

  // Buy the label
  const buyRes = await fetch(`${baseUrl}/2024-09/shipments/${shipmentId}/buy_label`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EASYSHIP_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      courier_id: uspsRate.courier_id
    })
  });

  const labelData = await buyRes.json();

  if (!buyRes.ok || labelData.error) {
    throw new Error(labelData.error?.message || 'Failed to buy label');
  }

  return {
    trackingNumber: labelData.shipment?.tracking_number || labelData.tracking_number,
    labelUrl: labelData.shipment?.label_url || labelData.label_url,
    rate: uspsRate.total_charge,
    carrier: uspsRate.courier_name || 'USPS',
    service: uspsRate.courier_service || 'Standard',
    estimatedDelivery: uspsRate.delivery_time_range || 'TBD',
    shipmentId: shipmentId
  };
}

/**
 * EasyPost label creation — ships seller → buyer directly
 * Free for <3,000 labels/month, has tracking webhooks
 */
export async function createEasyPostLabel(seller, productTitle, buyerAddress) {
  const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY;

  if (!EASYPOST_API_KEY) {
    throw new Error('EasyPost API key not configured');
  }

  if (!buyerAddress) {
    throw new Error('Buyer address required for EasyPost label');
  }

  if (!seller.address_line1 || !seller.city || !seller.state || !seller.zip) {
    throw new Error('Seller address incomplete');
  }

  const authHeader = 'Basic ' + Buffer.from(EASYPOST_API_KEY + ':').toString('base64');

  const shipmentRes = await fetch('https://api.easypost.com/v2/shipments', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      shipment: {
        from_address: {
          name: seller.name,
          street1: seller.address_line1,
          street2: seller.address_line2 || '',
          city: seller.city,
          state: seller.state,
          zip: seller.zip,
          country: 'US',
          phone: seller.phone || ''
        },
        to_address: {
          name: buyerAddress.name,
          street1: buyerAddress.street1,
          street2: buyerAddress.street2 || '',
          city: buyerAddress.city,
          state: buyerAddress.state,
          zip: buyerAddress.zip,
          country: buyerAddress.country || 'US',
          phone: buyerAddress.phone || ''
        },
        parcel: {
          length: 12,
          width: 9,
          height: 3,
          weight: 16 // 1 lb for clothing
        },
        reference: productTitle?.slice(0, 50) || 'Consignment Item'
      }
    })
  });

  const shipment = await shipmentRes.json();

  if (shipment.error) {
    throw new Error(shipment.error.message || 'Failed to create shipment');
  }

  // Pick cheapest rate, prefer USPS Priority
  const rates = shipment.rates || [];
  const priorityRate = rates.find(r => r.service === 'Priority')
    || rates.find(r => r.carrier === 'USPS')
    || rates[0];

  if (!priorityRate) {
    throw new Error('No shipping rates available');
  }

  const buyRes = await fetch(`https://api.easypost.com/v2/shipments/${shipment.id}/buy`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rate: { id: priorityRate.id }
    })
  });

  const purchasedShipment = await buyRes.json();

  if (purchasedShipment.error) {
    throw new Error(purchasedShipment.error.message || 'Failed to buy label');
  }

  return {
    trackingNumber: purchasedShipment.tracking_code,
    labelUrl: purchasedShipment.postage_label?.label_url,
    rate: priorityRate.rate,
    carrier: 'USPS',
    service: priorityRate.service,
    shipmentId: shipment.id,
    estimatedDelivery: priorityRate.delivery_days ? `${priorityRate.delivery_days} days` : 'TBD'
  };
}

/**
 * Shippo label creation — ships seller → buyer directly
 * Free tier: 30 labels/month, tracking webhooks included
 * Docs: https://docs.goshippo.com
 */
export async function createShippoLabel(seller, productTitle, buyerAddress) {
  const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY;

  if (!SHIPPO_API_KEY) {
    throw new Error('Shippo API key not configured');
  }

  if (!buyerAddress) {
    throw new Error('Buyer address required for Shippo label');
  }

  if (!seller.address_line1 || !seller.city || !seller.state || !seller.zip) {
    throw new Error('Seller address incomplete');
  }

  const isTest = SHIPPO_API_KEY.includes('test');
  console.log(`📦 Using Shippo ${isTest ? 'TEST' : 'PRODUCTION'} API`);

  // Step 1: Create shipment (returns available rates)
  const shipmentRes = await fetch('https://api.goshippo.com/shipments/', {
    method: 'POST',
    headers: {
      'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      address_from: {
        name: seller.name,
        email: seller.email || '',
        street1: seller.address_line1,
        street2: seller.address_line2 || '',
        city: seller.city,
        state: seller.state,
        zip: seller.zip,
        country: 'US',
        phone: seller.phone || ''
      },
      address_to: {
        name: buyerAddress.name,
        street1: buyerAddress.street1,
        street2: buyerAddress.street2 || '',
        city: buyerAddress.city,
        state: buyerAddress.state,
        zip: buyerAddress.zip,
        country: buyerAddress.country || 'US',
        phone: buyerAddress.phone || ''
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

  const shipment = await shipmentRes.json();

  // Shippo returns warning messages for carriers that can't handle the route
  // (e.g. Royal Mail for US domestic) — these are NOT errors if rates exist
  if (!shipmentRes.ok) {
    const errorMsg = shipment.detail || shipment.messages?.[0]?.text || 'Failed to create Shippo shipment';
    console.error('📦 Shippo shipment error:', JSON.stringify(shipment));
    throw new Error(errorMsg);
  }

  if (shipment.messages?.length) {
    console.log('📦 Shippo warnings (non-fatal):', shipment.messages.map(m => m.text).join(', '));
  }

  // Step 2: Pick best USPS rate — only use USPS
  const rates = shipment.rates || [];
  const uspsRates = rates.filter(r => r.provider === 'USPS');

  if (uspsRates.length === 0) {
    const allProviders = [...new Set(rates.map(r => r.provider))].join(', ') || 'none';
    throw new Error(`No USPS rates available (carriers returned: ${allProviders})`);
  }

  // Prefer Priority, then cheapest USPS option
  const priorityRate = uspsRates.find(r => r.servicelevel?.token === 'usps_priority')
    || uspsRates.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))[0];

  // Step 3: Purchase label (create transaction)
  const txRes = await fetch('https://api.goshippo.com/transactions/', {
    method: 'POST',
    headers: {
      'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rate: priorityRate.object_id,
      label_file_type: 'PDF',
      async: false
    })
  });

  const transaction = await txRes.json();

  if (transaction.status === 'ERROR' || !txRes.ok) {
    const errorMsg = transaction.messages?.[0]?.text || transaction.detail || 'Failed to purchase Shippo label';
    console.error('📦 Shippo label error:', JSON.stringify(transaction));
    throw new Error(errorMsg);
  }

  console.log(`📦 Shippo label created: ${transaction.tracking_number} via ${priorityRate.provider}`);

  return {
    trackingNumber: transaction.tracking_number,
    labelUrl: transaction.label_url,
    rate: priorityRate.amount,
    carrier: priorityRate.provider || 'USPS',
    service: priorityRate.servicelevel?.name || priorityRate.servicelevel?.token || 'Standard',
    shipmentId: shipment.object_id,
    transactionId: transaction.object_id,
    estimatedDelivery: priorityRate.estimated_days ? `${priorityRate.estimated_days} days` : 'TBD'
  };
}

/**
 * Generate label or shipping instructions based on available integrations
 * Cascade: Shippo (primary) → EasyPost (backup) → Easyship → manual instructions
 */
export async function getShippingLabel(seller, productTitle, buyerAddress = null) {
  const errors = [];

  // PRIMARY: Shippo (30 labels/mo free, tracking webhooks, multi-carrier)
  if (process.env.SHIPPO_API_KEY && buyerAddress) {
    try {
      return await createShippoLabel(seller, productTitle, buyerAddress);
    } catch (err) {
      console.error('Shippo label failed:', err.message);
      errors.push(`Shippo: ${err.message}`);
    }
  } else if (!process.env.SHIPPO_API_KEY) {
    errors.push('Shippo: API key not configured');
  }

  // BACKUP: EasyPost (free <3k labels/month)
  if (process.env.EASYPOST_API_KEY && buyerAddress) {
    try {
      return await createEasyPostLabel(seller, productTitle, buyerAddress);
    } catch (err) {
      console.error('EasyPost label failed:', err.message);
      errors.push(`EasyPost: ${err.message}`);
    }
  }

  // BACKUP 2: Easyship
  if (process.env.EASYSHIP_API_KEY && buyerAddress) {
    try {
      return await createEasyshipLabel(seller, productTitle, buyerAddress);
    } catch (err) {
      console.error('Easyship label failed:', err.message);
      errors.push(`Easyship: ${err.message}`);
    }
  }

  // ALL providers failed — throw so the caller knows
  const reason = errors.length > 0
    ? errors.join(' | ')
    : 'No shipping providers configured';
  throw new Error(reason);
}

export { WAREHOUSE_ADDRESS };

/**
 * Register an externally-bought tracking number with Shippo so it monitors the
 * shipment and fires the same `track_updated` webhook our handler already consumes.
 * Used for concierge items, which ship on Phirstory's own postage (not a Shippo
 * label) and would otherwise never get a delivery update.
 * Docs: https://docs.goshippo.com/docs/tracking/tracking/
 */
const SHIPPO_CARRIER_SLUG = { usps: 'usps', ups: 'ups', fedex: 'fedex', dhl: 'dhl_express', dhx: 'dhl_express' };
export async function registerShippoTracking(carrier, trackingNumber) {
  const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY;
  if (!SHIPPO_API_KEY) throw new Error('Shippo API key not configured');
  if (!trackingNumber) throw new Error('Tracking number required');
  const slug = SHIPPO_CARRIER_SLUG[(carrier || 'usps').toLowerCase()] || 'usps';
  const res = await fetch('https://api.goshippo.com/tracks/', {
    method: 'POST',
    headers: { 'Authorization': `ShippoToken ${SHIPPO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ carrier: slug, tracking_number: trackingNumber, metadata: 'concierge' }),
  });
  if (!res.ok) throw new Error(`Shippo track register failed: ${res.status} ${await res.text().catch(() => '')}`);
  return await res.json();
}
