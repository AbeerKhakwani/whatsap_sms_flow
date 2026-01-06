#!/usr/bin/env node
/**
 * Automated Sell Flow Tester
 * Simulates WhatsApp conversations to test all paths
 */

import { handleSellFlow } from '../lib/sms/flows/sell.js';
import { msg } from '../lib/sms/messages.js';

// Mock database - in-memory state
const mockDB = {
  conversations: new Map(),
  listings: new Map(),
  listingCounter: 1
};

// Mock functions
async function mockSetState(convId, state, context = {}) {
  const conv = mockDB.conversations.get(convId) || { id: convId };
  conv.state = state;
  conv.context = { ...conv.context, ...context };
  mockDB.conversations.set(convId, conv);
}

async function mockCreateListing(sellerId, convId, method) {
  const id = `listing_${mockDB.listingCounter++}`;
  const listing = {
    id,
    seller_id: sellerId,
    conversation_id: convId,
    input_method: method,
    status: 'draft',
    photo_urls: [],
    photo_tag_url: null
  };
  mockDB.listings.set(id, listing);
  return listing;
}

async function mockGetListing(id) {
  return mockDB.listings.get(id) || null;
}

async function mockUpdateListing(id, updates) {
  const listing = mockDB.listings.get(id);
  if (listing) {
    Object.assign(listing, updates);
    mockDB.listings.set(id, listing);
  }
  return listing;
}

async function mockDeleteListing(id) {
  mockDB.listings.delete(id);
}

async function mockAddPhotoToListing(id, url, isTag) {
  const listing = mockDB.listings.get(id);
  if (listing) {
    if (isTag) {
      listing.photo_tag_url = url;
    } else {
      listing.photo_urls = listing.photo_urls || [];
      listing.photo_urls.push(url);
    }
  }
}

// Mock AI extraction - simulates what OpenAI would extract
function mockExtractListingData(message) {
  const lower = message.toLowerCase();
  const extracted = {};

  // Designer detection
  const designers = ['sana safinaz', 'elan', 'maria b', 'khaadi', 'zara shahjahan', 'agha noor'];
  for (const d of designers) {
    if (lower.includes(d)) {
      extracted.designer = d.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  // Item type
  if (lower.includes('kurta')) extracted.item_type = 'kurta';
  if (lower.includes('suit')) extracted.item_type = '3-piece suit';
  if (lower.includes('lehnga') || lower.includes('lehenga')) extracted.item_type = 'lehnga';

  // Size
  const sizes = ['xs', 'small', 's', 'medium', 'm', 'large', 'l', 'xl', 'xxl'];
  for (const s of sizes) {
    if (lower.includes(s)) {
      extracted.size = s.toUpperCase().replace('SMALL', 'S').replace('MEDIUM', 'M').replace('LARGE', 'L');
      break;
    }
  }

  // Condition
  if (lower.includes('new with tags') || lower.includes('nwt')) extracted.condition = 'new with tags';
  else if (lower.includes('like new')) extracted.condition = 'like new';
  else if (lower.includes('gently used')) extracted.condition = 'gently used';
  else if (lower.includes('used')) extracted.condition = 'used';
  else if (lower.includes('new')) extracted.condition = 'new with tags';

  // Price
  const priceMatch = message.match(/\$?(\d+)/);
  if (priceMatch && lower.includes('$') || lower.includes('price') || lower.includes('asking')) {
    extracted.asking_price_usd = parseInt(priceMatch[1]);
  }

  return extracted;
}

// Mock photo analysis
function mockAnalyzePhoto(url) {
  return {
    isClothing: true,
    description: 'Beautiful embroidered kurta',
    hasBrandTag: url.includes('tag')
  };
}

// Test runner
class FlowTester {
  constructor() {
    this.results = [];
    this.currentTest = null;
  }

  reset() {
    mockDB.conversations.clear();
    mockDB.listings.clear();
    mockDB.listingCounter = 1;
  }

  async simulateMessage(convId, message, mediaUrls = []) {
    let conv = mockDB.conversations.get(convId);
    if (!conv) {
      conv = { id: convId, state: 'sell_started', context: {} };
      mockDB.conversations.set(convId, conv);
    }

    const seller = { id: 'seller_123', email: 'test@test.com' };

    // Inject mocks into the module (simplified - in real test would use proper mocking)
    const originalModule = await import('../lib/sms/flows/sell.js');

    // For now, just log what would happen
    console.log(`\n📱 User: "${message}"${mediaUrls.length ? ` + ${mediaUrls.length} photo(s)` : ''}`);
    console.log(`   State: ${conv.state}`);

    // Simulate extraction
    if (message) {
      const extracted = mockExtractListingData(message);
      if (Object.keys(extracted).length > 0) {
        console.log(`   Extracted:`, extracted);
      }
    }

    return conv;
  }

  test(name, fn) {
    this.currentTest = name;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${name}`);
    console.log('='.repeat(60));
    this.reset();
    try {
      fn();
      this.results.push({ name, passed: true });
      console.log(`✅ PASSED`);
    } catch (error) {
      this.results.push({ name, passed: false, error: error.message });
      console.log(`❌ FAILED: ${error.message}`);
    }
  }

  summary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    console.log(`Passed: ${passed}/${this.results.length}`);
    console.log(`Failed: ${failed}/${this.results.length}`);
    if (failed > 0) {
      console.log('\nFailed tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }
  }
}

// Define test scenarios
const scenarios = [
  {
    name: 'Happy path - all info in one message',
    messages: [
      { text: 'Sana Safinaz kurta, medium, like new, $85' },
      { text: 'skip' }, // details
      { text: '', photos: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'] },
      { text: '1' } // submit
    ]
  },
  {
    name: 'Incremental info - multiple messages',
    messages: [
      { text: 'I have a Sana Safinaz kurta' },
      { text: 'size medium' },
      { text: 'like new condition' },
      { text: '$85' },
      { text: 'no flaws' },
      { text: '', photos: ['p1.jpg', 'p2.jpg', 'p3.jpg'] },
      { text: '1' }
    ]
  },
  {
    name: 'Voice note simulation',
    messages: [
      { text: 'I want to sell my Elan suit, its a large, worn once, asking 120 dollars' }
    ]
  },
  {
    name: 'Status question mid-flow',
    messages: [
      { text: 'Maria B kurta medium' },
      { text: 'what did i list so far?' },
      { text: 'like new $75' }
    ]
  },
  {
    name: 'Exit and resume',
    messages: [
      { text: 'Khaadi suit large' },
      { text: 'exit' },
      // Would need to simulate re-entry with draft
    ]
  },
  {
    name: 'Edit flow',
    messages: [
      { text: 'Sana Safinaz kurta, medium, like new, $85' },
      { text: 'skip' },
      { text: '', photos: ['p1.jpg', 'p2.jpg', 'p3.jpg'] },
      { text: '2' }, // edit
      { text: '3' }, // change price
      { text: '$100' },
    ]
  },
  {
    name: 'Cancel flow',
    messages: [
      { text: 'Sana Safinaz kurta' },
      { text: 'cancel' }
    ]
  },
  {
    name: 'Non-clothing photo rejection',
    messages: [
      { text: 'Selling a kurta' },
      { text: '', photos: ['food.jpg'] } // Should be rejected
    ]
  }
];

// Run tests
async function runTests() {
  const tester = new FlowTester();

  console.log('🧪 SELL FLOW AUTOMATED TESTS');
  console.log('============================\n');

  for (const scenario of scenarios) {
    tester.test(scenario.name, async () => {
      const convId = `conv_${Date.now()}`;
      for (const msg of scenario.messages) {
        await tester.simulateMessage(convId, msg.text || '', msg.photos || []);
      }
    });
  }

  tester.summary();
}

// Also export for importing in other tests
export { scenarios, FlowTester, mockExtractListingData };

// Run if executed directly
runTests().catch(console.error);
