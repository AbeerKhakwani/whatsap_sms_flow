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
 * Create EasyPost label (if API key configured)
 * Returns label URL and tracking number
 */
export async function createEasyPostLabel(seller, productTitle) {
  const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY;

  if (!EASYPOST_API_KEY) {
    throw new Error('EasyPost API key not configured');
  }

  const labelRequest = createLabelRequest(seller, productTitle);

  // EasyPost uses Basic auth with API key as username
  const authHeader = 'Basic ' + Buffer.from(EASYPOST_API_KEY + ':').toString('base64');

  // Create shipment
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

  // Find cheapest rate (prefer USPS Priority)
  const rates = shipment.rates || [];
  const priorityRate = rates.find(r => r.service === 'Priority') || rates[0];

  if (!priorityRate) {
    throw new Error('No shipping rates available');
  }

  // Buy the label
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
 */
export async function getShippingLabel(seller, productTitle) {
  // If EasyPost is configured, generate a real label
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
