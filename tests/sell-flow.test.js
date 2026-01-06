/**
 * Sell Flow Unit Tests
 * Run with: node --experimental-vm-modules node_modules/jest/bin/jest.js tests/sell-flow.test.js
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the database
const mockListing = {
  id: 'test-listing-123',
  seller_id: 'seller-123',
  designer: null,
  item_type: null,
  size: null,
  condition: null,
  asking_price_usd: null,
  photo_tag_url: null,
  photo_urls: []
};

let currentListing = { ...mockListing };
let currentState = 'sell_started';
let currentContext = {};

// Mock db functions
jest.unstable_mockModule('../lib/sms/db.js', () => ({
  setState: jest.fn(async (id, state, context) => {
    currentState = state;
    currentContext = context || {};
  }),
  createListing: jest.fn(async () => ({ ...mockListing })),
  getListing: jest.fn(async () => currentListing),
  updateListing: jest.fn(async (id, updates) => {
    currentListing = { ...currentListing, ...updates };
    return currentListing;
  }),
  deleteListing: jest.fn(async () => true),
  addPhotoToListing: jest.fn(async (id, url, isTag) => {
    if (isTag) {
      currentListing.photo_tag_url = url;
    } else {
      currentListing.photo_urls = [...(currentListing.photo_urls || []), url];
    }
  }),
  getListingMissingFields: jest.fn((listing) => {
    const required = ['designer', 'item_type', 'size', 'condition', 'asking_price_usd'];
    return required.filter(f => !listing[f]);
  }),
  getListingMissingPhotos: jest.fn((listing) => {
    const missing = [];
    if (!listing.photo_tag_url) missing.push('tag');
    if ((listing.photo_urls?.length || 0) < 3) missing.push('item photos');
    return missing;
  }),
  findDraftListing: jest.fn(async () => null),
  updateConversation: jest.fn(async () => ({})),
  isListingComplete: jest.fn((listing) => false)
}));

// Mock AI
jest.unstable_mockModule('../lib/sms/ai.js', () => ({
  extractListingData: jest.fn(async (message) => {
    // Simple extraction
    const data = {};
    if (message.toLowerCase().includes('sana')) data.designer = 'Sana Safinaz';
    if (message.toLowerCase().includes('kurta')) data.item_type = 'Kurta';
    if (message.match(/\$?\d+/)) data.asking_price_usd = parseInt(message.match(/\d+/)[0]);
    return data;
  }),
  validatePhotosAreSameOutfit: jest.fn(async () => ({ valid: true }))
}));

// Mock Shopify
jest.unstable_mockModule('../lib/shopify.js', () => ({
  createDraft: jest.fn(async () => ({ id: 'shopify-123' })),
  addProductImage: jest.fn(async () => ({}))
}));

describe('Sell Flow', () => {
  beforeEach(() => {
    currentListing = { ...mockListing };
    currentState = 'sell_started';
    currentContext = {};
  });

  describe('Input Method Selection', () => {
    test('selecting TEXT shows text prompt', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      const conv = { id: 'conv-1', state: 'sell_started', context: {} };
      const seller = { id: 'seller-1' };

      const response = await handleSellFlow('text', conv, seller, []);

      expect(response).toContain('Tell me about your item');
    });

    test('selecting FORM starts form flow', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      const conv = { id: 'conv-1', state: 'sell_started', context: {} };
      const seller = { id: 'seller-1' };

      const response = await handleSellFlow('form', conv, seller, []);

      expect(response).toContain('designer');
    });
  });

  describe('Form Flow', () => {
    test('designer input moves to item type', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      const conv = { id: 'conv-1', state: 'sell_form_designer', context: {} };
      const seller = { id: 'seller-1' };

      const response = await handleSellFlow('Sana Safinaz', conv, seller, []);

      expect(currentState).toBe('sell_form_item_type');
    });

    test('item type button maps correctly', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      currentContext = { listing_id: 'test-123' };
      const conv = { id: 'conv-1', state: 'sell_form_item_type', context: currentContext };
      const seller = { id: 'seller-1' };

      await handleSellFlow('3piece', conv, seller, []);

      expect(currentListing.item_type).toBe('3-Piece Suit');
    });

    test('size button maps correctly', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      currentContext = { listing_id: 'test-123' };
      const conv = { id: 'conv-1', state: 'sell_form_size', context: currentContext };
      const seller = { id: 'seller-1' };

      await handleSellFlow('medium', conv, seller, []);

      expect(currentListing.size).toBe('M');
    });
  });

  describe('Interruption Handling', () => {
    test('saying "sell" mid-flow asks to continue or start fresh', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      currentContext = { listing_id: 'test-123' };
      currentListing.designer = 'Test Designer';
      const conv = { id: 'conv-1', state: 'sell_awaiting_tag_photo', context: currentContext };
      const seller = { id: 'seller-1' };

      const response = await handleSellFlow('sell', conv, seller, []);

      expect(currentState).toBe('sell_interruption');
      expect(response.text || response).toContain('already listing');
    });
  });

  describe('Price Parsing', () => {
    test('parses "$75"', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      currentContext = { listing_id: 'test-123' };
      const conv = { id: 'conv-1', state: 'sell_form_price', context: currentContext };
      const seller = { id: 'seller-1' };

      await handleSellFlow('$75', conv, seller, []);

      expect(currentListing.asking_price_usd).toBe(75);
    });

    test('parses "75"', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      currentContext = { listing_id: 'test-123' };
      const conv = { id: 'conv-1', state: 'sell_form_price', context: currentContext };
      const seller = { id: 'seller-1' };

      await handleSellFlow('75', conv, seller, []);

      expect(currentListing.asking_price_usd).toBe(75);
    });

    test('rejects invalid price', async () => {
      const { handleSellFlow } = await import('../lib/sms/flows/sell.js');
      currentContext = { listing_id: 'test-123' };
      const conv = { id: 'conv-1', state: 'sell_form_price', context: currentContext };
      const seller = { id: 'seller-1' };

      const response = await handleSellFlow('abc', conv, seller, []);

      expect(response).toContain("doesn't look like a price");
    });
  });
});
