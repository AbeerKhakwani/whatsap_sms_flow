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

  // Easyship API - Create shipment and get label
  const response = await fetch('https://api.easyship.com/2023-01/shipments', {
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
        contact_phone: buyerAddress.phone || ''
      },
      parcels: [{
        items: [{
          description: productTitle?.slice(0, 100) || 'Clothing Item',
          quantity: 1,
          actual_weight: 0.5,  // 0.5 kg default for clothing
          declared_currency: 'USD',
          declared_customs_value: 50
        }]
      }],
      shipping_settings: {
        output_currency: 'USD'
      }
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.message || 'Failed to create Easyship shipment');
  }

  // Get rates and buy cheapest
  const shipmentId = data.shipment?.easyship_shipment_id;

  if (!shipmentId) {
    throw new Error('No shipment ID returned');
  }

  // Get rates
  const ratesRes = await fetch(`https://api.easyship.com/2023-01/shipments/${shipmentId}/rates`, {
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
  const buyRes = await fetch(`https://api.easyship.com/2023-01/shipments/${shipmentId}/buy_label`, {
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
 * Legacy EasyPost label creation (if you switch back)
 */
export async function createEasyPostLabel(seller, productTitle) {
  const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY;

  if (!EASYPOST_API_KEY) {
    throw new Error('EasyPost API key not configured');
  }

  const labelRequest = createLabelRequest(seller, productTitle);
  const authHeader = 'Basic ' + Buffer.from(EASYPOST_API_KEY + ':').toString('base64');

  const shipmentRes = await fetch('https://api.easypost.com/v2/shipments', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      shipment: {
        from_address: labelRequest.from_address,
        to_address: labelRequest.to_address,
        parcel: labelRequest.parcel,
        reference: labelRequest.reference
      }
    })
  });

  const shipment = await shipmentRes.json();

  if (shipment.error) {
    throw new Error(shipment.error.message || 'Failed to create shipment');
  }

  const rates = shipment.rates || [];
  const priorityRate = rates.find(r => r.service === 'Priority') || rates[0];

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
    estimatedDelivery: priorityRate.delivery_days ? `${priorityRate.delivery_days} days` : 'TBD'
  };
}

/**
 * Generate label or shipping instructions based on available integrations
 * @param {Object} seller - Seller info with address
 * @param {string} productTitle - Product name for reference
 * @param {Object} buyerAddress - Buyer's shipping address (for Easyship)
 */
export async function getShippingLabel(seller, productTitle, buyerAddress = null) {
  // If Easyship is configured and we have buyer address, use it
  if (process.env.EASYSHIP_API_KEY && buyerAddress) {
    try {
      return await createEasyshipLabel(seller, productTitle, buyerAddress);
    } catch (err) {
      console.error('Easyship label failed:', err.message);
      // Fall through to EasyPost or manual instructions
    }
  }

  // If EasyPost is configured, generate a real label (ships to warehouse)
  if (process.env.EASYPOST_API_KEY) {
    try {
      return await createEasyPostLabel(seller, productTitle);
    } catch (err) {
      console.error('EasyPost label failed:', err.message);
      // Fall through to manual instructions
    }
  }

  // Otherwise, return manual shipping instructions
  return {
    type: 'instructions',
    message: getShippingInstructions(seller, productTitle),
    warehouseAddress: WAREHOUSE_ADDRESS
  };
}

export { WAREHOUSE_ADDRESS };
