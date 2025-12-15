// tests/setup.js
// Global test setup - mocks Supabase and OpenAI

import { vi } from 'vitest';

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-openai-key';

// Helper to extract listing data from user message (for AI mock)
function extractDataFromMessage(message) {
  const msgLower = message.toLowerCase();
  const extractedData = {};

  // Extract designer
  const designers = ['sana safinaz', 'elan', 'agha noor', 'maria b', 'khaadi', 'zara shahjahan'];
  for (const d of designers) {
    if (msgLower.includes(d)) {
      extractedData.designer = d.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  // Extract item type
  const itemTypes = ['kurta', 'suit', 'lehnga', 'saree', 'choli', 'shirt', 'dress'];
  for (const t of itemTypes) {
    if (msgLower.includes(t)) {
      extractedData.item_type = t;
    }
  }

  // Extract size
  const sizePatterns = [
    { pattern: /\bsize\s+xs\b/i, value: 'XS' },
    { pattern: /\bsize\s+s\b/i, value: 'S' },
    { pattern: /\bsize\s+m\b/i, value: 'M' },
    { pattern: /\bsize\s+l\b/i, value: 'L' },
    { pattern: /\bsize\s+xl\b/i, value: 'XL' },
    { pattern: /\bsmall\b/i, value: 'S' },
    { pattern: /\bmedium\b/i, value: 'M' },
    { pattern: /\blarge\b/i, value: 'L' },
  ];
  for (const { pattern, value } of sizePatterns) {
    if (pattern.test(msgLower)) {
      extractedData.size = value;
      break;
    }
  }

  // Extract condition
  if (msgLower.includes('new with tags') || msgLower.includes('nwt')) {
    extractedData.condition = 'new with tags';
  } else if (msgLower.includes('like new')) {
    extractedData.condition = 'like new';
  } else if (msgLower.includes('gently used')) {
    extractedData.condition = 'gently used';
  } else if (msgLower.includes('used')) {
    extractedData.condition = 'used';
  }

  // Extract price
  const pricePatterns = [
    /\$(\d+)/,
    /(\d+)\s*(?:dollars?|usd)/i,
    /price[:\s]+(\d+)/i,
  ];
  for (const pattern of pricePatterns) {
    const match = msgLower.match(pattern);
    if (match) {
      extractedData.asking_price_usd = parseInt(match[1]);
      break;
    }
  }

  // Extract pieces
  if (msgLower.includes('3 piece') || msgLower.includes('3-piece') || msgLower.includes('three piece')) {
    extractedData.pieces_included = '3 pieces';
  } else if (msgLower.includes('2 piece') || msgLower.includes('2-piece')) {
    extractedData.pieces_included = '2 pieces';
  }

  return extractedData;
}

// Mock OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class OpenAI {
      constructor() {
        this.chat = {
          completions: {
            create: async ({ messages }) => {
              // Find the last user message
              const userMessages = messages.filter(m => m.role === 'user');
              const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

              // Extract data from user message
              const extractedData = extractDataFromMessage(lastUserMsg);

              // Generate response message
              let responseMessage = '';
              if (Object.keys(extractedData).length > 0) {
                responseMessage = 'Got it! ';
                if (extractedData.designer) responseMessage += `${extractedData.designer} `;
                if (extractedData.item_type) responseMessage += `${extractedData.item_type}. `;
                responseMessage += 'What else can you tell me?';
              } else {
                responseMessage = 'Tell me about the item you want to list.';
              }

              return {
                choices: [{
                  message: {
                    content: JSON.stringify({
                      message: responseMessage,
                      extractedData: extractedData,
                      isComplete: false,
                      missingFields: [],
                      photoCount: 0,
                      photosNeeded: []
                    })
                  }
                }]
              };
            }
          }
        };
      }
    }
  };
});

// Mock data store (simulates database)
global.mockDb = {
  sellers: [],
  conversations: [],
  listings: [],

  reset() {
    this.sellers = [];
    this.conversations = [];
    this.listings = [];
  },

  addListing(listing) {
    const id = listing.id || `listing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newListing = {
      id,
      status: 'incomplete',
      listing_data: {},
      conversation: [],
      created_at: new Date().toISOString(),
      ...listing
    };
    this.listings.push(newListing);
    return newListing;
  },

  findListing(id) {
    return this.listings.find(l => l.id === id) || null;
  },

  updateListing(id, updates) {
    const idx = this.listings.findIndex(l => l.id === id);
    if (idx >= 0) {
      this.listings[idx] = { ...this.listings[idx], ...updates };
      return this.listings[idx];
    }
    return null;
  },

  findIncompleteListingBySeller(sellerId) {
    return this.listings
      .filter(l => l.seller_id === sellerId && l.status === 'incomplete')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  },

  deleteListing(id) {
    const idx = this.listings.findIndex(l => l.id === id);
    if (idx >= 0) {
      this.listings.splice(idx, 1);
      return true;
    }
    return false;
  },

  addSeller(seller) {
    const id = seller.id || `seller-${Date.now()}`;
    const newSeller = { id, ...seller };
    this.sellers.push(newSeller);
    return newSeller;
  },
  
  addConversation(conv) {
    const id = conv.id || `conv-${Date.now()}`;
    const newConv = { 
      id, 
      created_at: new Date().toISOString(),
      ...conv 
    };
    this.conversations.push(newConv);
    return newConv;
  },
  
  findSellerByPhone(phone) {
    return this.sellers.find(s => s.phone === phone) || null;
  },
  
  findSellerByEmail(email) {
    const emailLower = email.toLowerCase();
    return this.sellers.find(s => 
      s.email?.toLowerCase() === emailLower || 
      s.paypal_email?.toLowerCase() === emailLower
    ) || null;
  },
  
  findConversation(phone) {
    return this.conversations
      .filter(c => c.phone_number === phone)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  },
  
  updateConversation(id, updates) {
    const idx = this.conversations.findIndex(c => c.id === id);
    if (idx >= 0) {
      this.conversations[idx] = { ...this.conversations[idx], ...updates };
      return this.conversations[idx];
    }
    return null;
  }
};

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: (columns) => ({
        eq: (field, value) => {
          // Store filter context for chained calls
          const filters = { [field]: value };

          const chainable = {
            eq: (field2, value2) => {
              filters[field2] = value2;
              return chainable;
            },
            single: async () => {
              if (table === 'sellers') {
                const seller = global.mockDb.findSellerByPhone(filters.phone);
                return { data: seller, error: null };
              }
              if (table === 'sms_conversations') {
                const conv = global.mockDb.findConversation(filters.phone_number);
                return { data: conv, error: null };
              }
              if (table === 'listings') {
                // Support both id lookup and seller_id+status lookup
                if (filters.seller_id && filters.status === 'incomplete') {
                  const listing = global.mockDb.findIncompleteListingBySeller(filters.seller_id);
                  return { data: listing, error: listing ? null : { code: 'PGRST116' } };
                }
                const listing = global.mockDb.findListing(filters.id);
                return { data: listing, error: null };
              }
              return { data: null, error: null };
            },
            maybeSingle: async () => {
              if (table === 'sellers') {
                const seller = global.mockDb.findSellerByPhone(filters.phone);
                return { data: seller, error: null };
              }
              if (table === 'sms_conversations') {
                const conv = global.mockDb.findConversation(filters.phone_number);
                return { data: conv, error: null };
              }
              if (table === 'listings') {
                const listing = global.mockDb.findListing(filters.id);
                return { data: listing, error: null };
              }
              return { data: null, error: null };
            },
            order: () => ({
              limit: () => ({
                single: async () => {
                  if (table === 'listings' && filters.seller_id && filters.status === 'incomplete') {
                    const listing = global.mockDb.findIncompleteListingBySeller(filters.seller_id);
                    return { data: listing, error: listing ? null : { code: 'PGRST116' } };
                  }
                  return { data: null, error: null };
                },
                maybeSingle: async () => {
                  if (table === 'sms_conversations') {
                    const conv = global.mockDb.findConversation(filters.phone_number);
                    return { data: conv, error: null };
                  }
                  return { data: null, error: null };
                }
              })
            })
          };
          return chainable;
        },
        or: (condition) => ({
          maybeSingle: async () => {
            const emailMatch = condition.match(/email\.ilike\.([^,]+)/);
            if (emailMatch) {
              const seller = global.mockDb.findSellerByEmail(emailMatch[1]);
              return { data: seller, error: null };
            }
            return { data: null, error: null };
          }
        })
      }),

      insert: (data) => ({
        select: () => ({
          single: async () => {
            if (table === 'sellers') {
              const seller = global.mockDb.addSeller(data);
              return { data: seller, error: null };
            }
            if (table === 'sms_conversations') {
              const conv = global.mockDb.addConversation(data);
              return { data: conv, error: null };
            }
            if (table === 'listings') {
              const listing = global.mockDb.addListing(data);
              return { data: listing, error: null };
            }
            return { data: null, error: null };
          }
        }),
        then: async (cb) => {
          if (table === 'sms_conversations') {
            global.mockDb.addConversation(data);
          }
          if (table === 'listings') {
            global.mockDb.addListing(data);
          }
          return cb({ error: null });
        }
      }),

      update: (updates) => ({
        eq: (field, value) => ({
          // Support .select().single() chain after update
          select: () => ({
            single: async () => {
              if (table === 'sellers') {
                const seller = global.mockDb.sellers.find(s => s.id === value);
                if (seller) {
                  Object.assign(seller, updates);
                  return { data: seller, error: null };
                }
              }
              if (table === 'sms_conversations') {
                const conv = global.mockDb.conversations.find(c => c.id === value);
                if (conv) {
                  Object.assign(conv, updates);
                  return { data: conv, error: null };
                }
              }
              if (table === 'listings') {
                const listing = global.mockDb.listings.find(l => l.id === value);
                if (listing) {
                  Object.assign(listing, updates);
                  return { data: listing, error: null };
                }
              }
              return { data: null, error: null };
            }
          }),
          // Also support direct .then() for backwards compatibility
          then: async (cb) => {
            if (table === 'sellers') {
              const seller = global.mockDb.sellers.find(s => s.id === value);
              if (seller) Object.assign(seller, updates);
            }
            if (table === 'sms_conversations') {
              const conv = global.mockDb.conversations.find(c => c.id === value);
              if (conv) Object.assign(conv, updates);
            }
            if (table === 'listings') {
              const listing = global.mockDb.listings.find(l => l.id === value);
              if (listing) Object.assign(listing, updates);
            }
            return cb ? cb({ error: null }) : { error: null };
          }
        })
      }),

      delete: () => ({
        eq: (field, value) => ({
          then: async (cb) => {
            if (table === 'listings') {
              global.mockDb.deleteListing(value);
            }
            return cb ? cb({ error: null }) : { error: null };
          }
        })
      })
    })
  })
}));

// Helper to extract text content from a message (handles both string and multimodal array format)
function getTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    // Multimodal format: [{type: 'text', text: '...'}, {type: 'image_url', ...}]
    const textPart = content.find(c => c.type === 'text');
    return textPart?.text || '';
  }
  return '';
}

// Mock OpenAI fetch for intent detection and sell flow AI
// Store original fetch before mocking (may be undefined in test environment)
const originalFetch = global.fetch;

// Create a proxy that only intercepts OpenAI requests
const openAIFetchMock = async (url, options) => {
  // Only mock OpenAI API calls
  if (typeof url === 'string' && url.includes('openai.com')) {
    const body = JSON.parse(options.body);
    const messages = body.messages || [];

    // Extract text content, handling both string and multimodal array formats
    const userMsg = messages.find(m => m.role === 'user');
    const userMessage = getTextContent(userMsg?.content)?.toLowerCase() || '';
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastUserMessage = getTextContent(lastUserMsg?.content) || '';

    // Check if this is a sell flow AI request (has system prompt about listing assistant)
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const isSellFlowRequest = systemPrompt.includes('listing') || systemPrompt.includes('designer clothing');

    if (isSellFlowRequest) {
      // Simulate AI response for sell flow - extract data from user message
      const extractedData = {};
      const msgLower = lastUserMessage.toLowerCase();

      // Extract designer
      const designers = ['sana safinaz', 'elan', 'agha noor', 'maria b', 'khaadi', 'zara shahjahan'];
      for (const d of designers) {
        if (msgLower.includes(d)) {
          extractedData.designer = d.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }

      // Extract item type
      const itemTypes = ['kurta', 'suit', 'lehnga', 'saree', 'choli', 'shirt', 'dress'];
      for (const t of itemTypes) {
        if (msgLower.includes(t)) {
          extractedData.item_type = t;
        }
      }

      // Extract size (must be preceded by "size" or be a standalone word)
      const sizePatterns = [
        { pattern: /\bsize\s+xs\b/i, value: 'XS' },
        { pattern: /\bsize\s+s\b/i, value: 'S' },
        { pattern: /\bsize\s+m\b/i, value: 'M' },
        { pattern: /\bsize\s+l\b/i, value: 'L' },
        { pattern: /\bsize\s+xl\b/i, value: 'XL' },
        { pattern: /\bsize\s+xxl\b/i, value: 'XXL' },
        { pattern: /\bsmall\b/i, value: 'S' },
        { pattern: /\bmedium\b/i, value: 'M' },
        { pattern: /\blarge\b/i, value: 'L' },
        { pattern: /\bxs\b/i, value: 'XS' },
        { pattern: /\bxxl\b/i, value: 'XXL' },
        { pattern: /\bxl\b/i, value: 'XL' },
      ];
      for (const { pattern, value } of sizePatterns) {
        if (pattern.test(msgLower)) {
          extractedData.size = value;
          break;
        }
      }

      // Extract condition
      if (msgLower.includes('new with tags') || msgLower.includes('nwt')) {
        extractedData.condition = 'new with tags';
      } else if (msgLower.includes('like new')) {
        extractedData.condition = 'like new';
      } else if (msgLower.includes('gently used')) {
        extractedData.condition = 'gently used';
      } else if (msgLower.includes('used')) {
        extractedData.condition = 'used';
      }

      // Extract price (must have $ or word "price" nearby, avoid matching "3 piece")
      const pricePatterns = [
        /\$(\d+)/,                    // $120
        /(\d+)\s*(?:dollars?|usd)/i,  // 120 dollars, 120 USD
        /price[:\s]+(\d+)/i,          // price: 120, price 120
      ];
      for (const pattern of pricePatterns) {
        const match = msgLower.match(pattern);
        if (match) {
          extractedData.asking_price_usd = parseInt(match[1]);
          break;
        }
      }

      // Extract pieces
      if (msgLower.includes('3 piece') || msgLower.includes('3-piece') || msgLower.includes('three piece')) {
        extractedData.pieces = 3;
      } else if (msgLower.includes('2 piece') || msgLower.includes('2-piece') || msgLower.includes('two piece')) {
        extractedData.pieces = 2;
      } else if (msgLower.includes('1 piece') || msgLower.includes('one piece')) {
        extractedData.pieces = 1;
      }

      // Get what's still needed from the system context
      const contextMsg = messages.find(m => m.content?.includes('Still need:'))?.content || '';
      const stillNeedMatch = contextMsg.match(/Still need: (.*)/);
      const stillNeeded = stillNeedMatch ? stillNeedMatch[1].split(', ').filter(f => f && f !== 'Nothing - ready to confirm!') : [];

      // Generate appropriate response message
      let responseMessage = '';
      if (Object.keys(extractedData).length > 0) {
        responseMessage = `Got it! `;
        if (extractedData.designer) responseMessage += `${extractedData.designer} `;
        if (extractedData.item_type) responseMessage += `${extractedData.item_type}. `;
      }

      // Filter out what we just extracted
      const remaining = stillNeeded.filter(f => !extractedData[f]);

      if (remaining.length === 0 && Object.keys(extractedData).length > 0) {
        responseMessage += `I have everything I need!`;
      } else if (remaining.length > 0) {
        const nextField = remaining[0];
        if (nextField === 'designer') responseMessage += `What designer/brand is this?`;
        else if (nextField === 'item_type') responseMessage += `What type of item is it?`;
        else if (nextField === 'size') responseMessage += `What size is it?`;
        else if (nextField === 'condition') responseMessage += `What condition is it in?`;
        else if (nextField === 'asking_price_usd') responseMessage += `What price are you asking?`;
        else if (nextField === 'pieces') responseMessage += `How many pieces (1, 2, or 3)?`;
        else responseMessage += `What else can you tell me about it?`;
      } else {
        responseMessage = `Tell me about the item you want to list.`;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                message: responseMessage,
                extractedData: extractedData,
                isComplete: remaining.length === 0 && Object.keys(extractedData).length > 0
              })
            }
          }]
        })
      };
    }

    // Default: intent detection for menu/action states
    let intent = 'unknown';
    if (userMessage.includes('sell') || userMessage.includes('list')) intent = 'sell';
    else if (userMessage.includes('buy') || userMessage.includes('shop') || userMessage.includes('browse')) intent = 'buy';
    else if (userMessage.includes('listing') || userMessage.includes('my item')) intent = 'listings';

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: intent } }]
      })
    };
  }
  // For non-OpenAI requests, pass through to original fetch or throw if none exists
  if (originalFetch) {
    return originalFetch(url, options);
  }
  // If no original fetch exists (test environment), throw a helpful error
  throw new Error(`Unmocked fetch call to: ${url}`);
};

// Apply the mock
global.fetch = openAIFetchMock;