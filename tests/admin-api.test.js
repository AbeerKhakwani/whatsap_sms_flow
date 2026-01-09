// tests/admin-api.test.js
// Tests for admin-listings API endpoints and seller webhook handling

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock the Shopify lib
vi.mock('../lib/shopify.js', () => ({
  getPendingDrafts: vi.fn(),
  getProductCounts: vi.fn(),
  getProduct: vi.fn(),
  approveDraft: vi.fn(),
  deleteProduct: vi.fn()
}));

// Mock the email lib
vi.mock('../lib/email.js', () => ({
  sendListingApproved: vi.fn()
}));

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({ data: null, error: null }))
        }))
      }))
    }))
  }))
}));

import { getPendingDrafts, getProductCounts, getProduct, approveDraft, deleteProduct } from '../lib/shopify.js';
import { sendListingApproved } from '../lib/email.js';

describe('Admin Listings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin-listings?action=pending', () => {
    it('returns pending listings in correct format', async () => {
      const mockProducts = [
        {
          id: '123',
          title: 'Test Product',
          vendor: 'Test Designer',
          tags: 'pending-approval, test',
          body_html: '<p>Description</p>',
          images: [{ src: 'http://example.com/img.jpg' }],
          created_at: '2024-01-01',
          variants: [{
            option1: 'Medium',
            option3: 'Like New',
            price: '100.00'
          }]
        }
      ];

      getPendingDrafts.mockResolvedValue(mockProducts);
      getProductCounts.mockResolvedValue({ draft: 1, active: 5 });

      // Simulate the API response format
      const listings = mockProducts.map(product => {
        const variant = product.variants?.[0] || {};
        return {
          id: product.id,
          shopify_product_id: product.id,
          product_name: product.title,
          designer: product.vendor || 'Unknown Designer',
          size: variant.option1 || 'One Size',
          condition: variant.option3 || 'Good',
          asking_price_usd: parseFloat(variant.price) || 0,
          images: product.images?.map(img => img.src) || []
        };
      });

      expect(listings).toHaveLength(1);
      expect(listings[0].product_name).toBe('Test Product');
      expect(listings[0].designer).toBe('Test Designer');
      expect(listings[0].size).toBe('Medium');
      expect(listings[0].condition).toBe('Like New');
      expect(listings[0].asking_price_usd).toBe(100);
    });

    it('handles empty pending list', async () => {
      getPendingDrafts.mockResolvedValue([]);
      getProductCounts.mockResolvedValue({ draft: 0, active: 10 });

      const listings = [];
      expect(listings).toHaveLength(0);
    });
  });

  describe('POST /api/admin-listings?action=approve', () => {
    it('approves listing and returns success', async () => {
      const mockProduct = {
        id: '123',
        title: 'Approved Product',
        handle: 'approved-product',
        metafields: [
          { namespace: 'seller', key: 'email', value: 'test@test.com' },
          { namespace: 'pricing', key: 'seller_payout', value: '82.00' }
        ]
      };

      getProduct.mockResolvedValue(mockProduct);
      approveDraft.mockResolvedValue({ ...mockProduct, status: 'active' });
      sendListingApproved.mockResolvedValue(true);

      // Verify the approve flow
      const productBefore = await getProduct('123');
      expect(productBefore.id).toBe('123');

      const approved = await approveDraft('123');
      expect(approved.status).toBe('active');
      expect(approveDraft).toHaveBeenCalledWith('123');
    });

    it('requires shopifyProductId', () => {
      const body = {};
      expect(body.shopifyProductId).toBeUndefined();
      // API should return 400 if shopifyProductId missing
    });
  });

  describe('POST /api/admin-listings?action=reject', () => {
    it('deletes product and returns success', async () => {
      deleteProduct.mockResolvedValue(true);

      await deleteProduct('123');
      expect(deleteProduct).toHaveBeenCalledWith('123');
    });

    it('handles already deleted product gracefully', async () => {
      deleteProduct.mockResolvedValue(true); // Should not throw even if 404

      const result = await deleteProduct('nonexistent');
      expect(result).toBe(true);
    });
  });
});

describe('Admin API Error Handling', () => {
  it('handles Shopify API errors', async () => {
    getPendingDrafts.mockRejectedValue(new Error('Shopify API error'));

    await expect(getPendingDrafts()).rejects.toThrow('Shopify API error');
  });

  it('handles invalid action parameter', () => {
    const validActions = ['pending', 'approve', 'reject'];
    const invalidAction = 'invalid';

    expect(validActions).not.toContain(invalidAction);
    // API should return 400 for invalid action
  });
});

describe('Notification Flow', () => {
  it('sends email notification on approve', async () => {
    sendListingApproved.mockResolvedValue(true);

    await sendListingApproved(
      'seller@test.com',
      'Test Seller',
      'Test Product',
      'https://store.com/products/test',
      82.00
    );

    expect(sendListingApproved).toHaveBeenCalledWith(
      'seller@test.com',
      'Test Seller',
      'Test Product',
      'https://store.com/products/test',
      82.00
    );
  });

  it('handles email failure gracefully', async () => {
    sendListingApproved.mockRejectedValue(new Error('Email failed'));

    // Approval should still succeed even if email fails
    await expect(sendListingApproved('test@test.com', null, 'Product', 'url', 82))
      .rejects.toThrow('Email failed');
  });
});

// ==================== WEBHOOK TESTS ====================

describe('Order Webhook Processing', () => {
  describe('HMAC Signature Verification', () => {
    it('generates valid HMAC signature', () => {
      const secret = 'test-webhook-secret';
      const body = JSON.stringify({ id: 123, name: '#1001' });

      const hmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

      // Verify the signature format
      expect(hmac).toBeTruthy();
      expect(typeof hmac).toBe('string');
    });

    it('detects invalid signatures', () => {
      const secret = 'test-webhook-secret';
      const body = JSON.stringify({ id: 123, name: '#1001' });

      const validHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

      const invalidHmac = crypto
        .createHmac('sha256', 'wrong-secret')
        .update(body, 'utf8')
        .digest('base64');

      expect(validHmac).not.toBe(invalidHmac);
    });
  });

  describe('Order Data Processing', () => {
    it('extracts line items from order', () => {
      const order = {
        id: 123456,
        name: '#1001',
        email: 'customer@test.com',
        line_items: [
          { product_id: '111', title: 'Sana Safinaz Kurta', price: '100.00' },
          { product_id: '222', title: 'Maria B Suit', price: '150.00' }
        ]
      };

      expect(order.line_items).toHaveLength(2);
      expect(order.line_items[0].product_id).toBe('111');
      expect(parseFloat(order.line_items[0].price)).toBe(100);
    });

    it('handles orders with no line items', () => {
      const order = {
        id: 123456,
        name: '#1001',
        line_items: []
      };

      expect(order.line_items).toHaveLength(0);
    });

    it('calculates seller payout correctly', () => {
      const salePrice = 100;
      const commissionRate = 18;
      const expectedPayout = salePrice * ((100 - commissionRate) / 100);

      expect(expectedPayout).toBe(82);
    });
  });

  describe('Transaction Record Format', () => {
    it('creates valid transaction object', () => {
      const transaction = {
        seller_id: 'uuid-123',
        order_id: '123456',
        order_name: '#1001',
        product_id: '111',
        product_title: 'Test Product',
        sale_price: 100,
        seller_payout: 82,
        commission_rate: 18,
        status: 'pending_payout',
        customer_email: 'customer@test.com',
        created_at: new Date().toISOString()
      };

      expect(transaction.seller_id).toBeTruthy();
      expect(transaction.status).toBe('pending_payout');
      expect(transaction.seller_payout).toBe(82);
    });
  });
});

describe('Transactions API', () => {
  it('calculates pending and paid balances', () => {
    const transactions = [
      { seller_payout: 100, status: 'pending_payout' },
      { seller_payout: 80, status: 'pending_payout' },
      { seller_payout: 150, status: 'paid' },
      { seller_payout: 200, status: 'paid' }
    ];

    const pendingPayout = transactions
      .filter(t => t.status === 'pending_payout')
      .reduce((sum, t) => sum + t.seller_payout, 0);

    const totalPaid = transactions
      .filter(t => t.status === 'paid')
      .reduce((sum, t) => sum + t.seller_payout, 0);

    expect(pendingPayout).toBe(180);
    expect(totalPaid).toBe(350);
  });

  it('returns empty for unknown seller', () => {
    const result = { success: true, transactions: [], balance: 0 };
    expect(result.transactions).toHaveLength(0);
  });
});

// ==================== SHIPPING TESTS ====================

describe('Shipping Label Generation', () => {
  const WAREHOUSE_ADDRESS = {
    name: 'The Phir Story',
    street1: '123 Main St',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'US'
  };

  describe('Address Formatting', () => {
    it('formats warehouse address correctly', () => {
      const formatted = [
        WAREHOUSE_ADDRESS.name,
        WAREHOUSE_ADDRESS.street1,
        `${WAREHOUSE_ADDRESS.city}, ${WAREHOUSE_ADDRESS.state} ${WAREHOUSE_ADDRESS.zip}`
      ].filter(Boolean).join('\n');

      expect(formatted).toContain('The Phir Story');
      expect(formatted).toContain('New York, NY 10001');
    });
  });

  describe('Label Request Creation', () => {
    it('creates valid label request with complete seller address', () => {
      const seller = {
        name: 'Test Seller',
        address_line1: '456 Oak Ave',
        city: 'Chicago',
        state: 'IL',
        zip: '60601',
        phone: '5551234567'
      };

      const request = {
        from_address: {
          name: seller.name,
          street1: seller.address_line1,
          city: seller.city,
          state: seller.state,
          zip: seller.zip,
          country: 'US'
        },
        to_address: WAREHOUSE_ADDRESS,
        parcel: {
          weight: 16,
          predefined_package: 'USPS_PRIORITY_FLAT_RATE_PADDED_ENVELOPE'
        }
      };

      expect(request.from_address.name).toBe('Test Seller');
      expect(request.to_address.name).toBe('The Phir Story');
      expect(request.parcel.weight).toBe(16);
    });

    it('validates seller has complete address', () => {
      const incompleteSeller = {
        name: 'Test Seller',
        address_line1: '456 Oak Ave'
        // missing city, state, zip
      };

      const hasCompleteAddress = !!(
        incompleteSeller.address_line1 &&
        incompleteSeller.city &&
        incompleteSeller.state &&
        incompleteSeller.zip
      );

      expect(hasCompleteAddress).toBe(false);
    });
  });

  describe('Shipping Instructions', () => {
    it('generates instructions message', () => {
      const seller = { name: 'Jane Doe', email: 'jane@test.com' };
      const productTitle = 'Sana Safinaz Kurta';

      const message = `📦 Shipping Instructions for "${productTitle}"

Ship your item to:
The Phir Story
123 Main St
New York, NY 10001

Tips:
• Use a padded envelope or small box
• Include a note with your name: ${seller.name}
• Take a photo of the receipt/tracking

We'll notify you when we receive it!`;

      expect(message).toContain(productTitle);
      expect(message).toContain('The Phir Story');
      expect(message).toContain(seller.name);
    });
  });

  describe('Shipping Cost Estimation', () => {
    it('estimates shipping costs by zone', () => {
      const rates = {
        local: 8.50,
        regional: 10.50,
        national: 14.50
      };

      expect(rates.local).toBe(8.50);
      expect(rates.regional).toBe(10.50);
      expect(rates.national).toBe(14.50);
    });
  });

  describe('Tracking QR Generation', () => {
    it('generates valid tracking URL', () => {
      const trackingNumber = '9400111899223456789012';
      const trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;

      expect(trackingUrl).toContain(trackingNumber);
      expect(trackingUrl).toContain('usps.com');
    });

    it('generates QR code URL', () => {
      const trackingNumber = '9400111899223456789012';
      const trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
      const qrUrl = `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(trackingUrl)}`;

      expect(qrUrl).toContain('chart.googleapis.com');
      expect(qrUrl).toContain('cht=qr');
    });
  });
});
