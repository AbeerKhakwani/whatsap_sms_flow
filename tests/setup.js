// tests/setup.js
// Global test setup - mocks Supabase and OpenAI

import { vi } from 'vitest';

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-openai-key';

// Mock data store (simulates database)
global.mockDb = {
  sellers: [],
  conversations: [],
  
  reset() {
    this.sellers = [];
    this.conversations = [];
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
    }
  }
};

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: () => ({
        eq: (field, value) => ({
          maybeSingle: async () => {
            if (table === 'sellers') {
              const seller = global.mockDb.findSellerByPhone(value);
              return { data: seller, error: null };
            }
            if (table === 'sms_conversations') {
              const conv = global.mockDb.findConversation(value);
              return { data: conv, error: null };
            }
            return { data: null, error: null };
          },
          order: () => ({
            limit: () => ({
              maybeSingle: async () => {
                if (table === 'sms_conversations') {
                  const conv = global.mockDb.findConversation(value);
                  return { data: conv, error: null };
                }
                return { data: null, error: null };
              }
            })
          })
        }),
        or: (condition) => ({
          maybeSingle: async () => {
            // Parse email from condition like "email.ilike.test@test.com,paypal_email.ilike.test@test.com"
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
            return { data: null, error: null };
          }
        }),
        then: async (cb) => {
          if (table === 'sms_conversations') {
            global.mockDb.addConversation(data);
          }
          return cb({ error: null });
        }
      }),
      update: (updates) => ({
        eq: (field, value) => ({
          then: async (cb) => {
            if (table === 'sellers') {
              const seller = global.mockDb.sellers.find(s => s.id === value);
              if (seller) Object.assign(seller, updates);
            }
            if (table === 'sms_conversations') {
              const conv = global.mockDb.conversations.find(c => c.id === value);
              if (conv) Object.assign(conv, updates);
            }
            return cb ? cb({ error: null }) : { error: null };
          }
        })
      })
    })
  })
}));

// Mock OpenAI fetch for intent detection
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (url.includes('openai.com')) {
    const body = JSON.parse(options.body);
    const userMessage = body.messages.find(m => m.role === 'user')?.content?.toLowerCase() || '';
    
    // Simulate AI intent detection
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
  return originalFetch(url, options);
};
