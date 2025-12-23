// tests/submit-listing.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch for Shopify API calls
global.fetch = vi.fn();

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'seller-123', email: 'test@test.com' },
        error: null
      })
    })
  })
}));

// Mock OpenAI
vi.mock('openai', () => ({
  default: class OpenAI {
    constructor() {
      this.audio = {
        transcriptions: {
          create: vi.fn().mockResolvedValue({ text: 'This is a beautiful Sana Safinaz kurta' })
        }
      };
      this.chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  designer: 'Sana Safinaz',
                  product_name: 'Lawn Suit',
                  size: 'M',
                  condition: 'Like New',
                  color: 'Blue',
                  material: 'Lawn',
                  original_price: 150,
                  asking_price: 75
                })
              }
            }]
          })
        }
      };
    }
  }
}));

describe('Submit Listing API', () => {
  let submitHandler;
  let transcribeHandler;
  let addImageHandler;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock successful Shopify responses
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ product: { id: 'shopify-123' } })
    });

    const submitModule = await import('../api/approve-listing.js');
    const transcribeModule = await import('../api/transcribe.js');
    const addImageModule = await import('../api/add-product-image.js');
    submitHandler = submitModule.default;
    transcribeHandler = transcribeModule.default;
    addImageHandler = addImageModule.default;
  });

  describe('POST /api/transcribe', () => {
    it('returns 405 for non-POST requests', async () => {
      const req = { method: 'GET' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await transcribeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('returns 400 when no audio provided', async () => {
      const req = { method: 'POST', body: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await transcribeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No audio data provided' });
    });

    it('transcribes audio successfully', async () => {
      const mockAudio = Buffer.from('fake audio data').toString('base64');

      const req = { method: 'POST', body: { audio: mockAudio } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await transcribeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        text: 'This is a beautiful Sana Safinaz kurta'
      });
    });
  });

  // Helper to create mock response with CORS headers support
  const createMockRes = () => ({
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    end: vi.fn()
  });

  describe('POST /api/approve-listing (web submission)', () => {
    it('returns 405 for non-POST requests', async () => {
      const req = { method: 'GET' };
      const res = createMockRes();

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('returns 400 when no description or listingId provided', async () => {
      const req = {
        method: 'POST',
        body: { email: 'test@test.com', phone: '555-1234' }
      };
      const res = createMockRes();

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Please provide listingId or description' });
    });

    it('creates Shopify draft with description', async () => {
      const req = {
        method: 'POST',
        body: {
          email: 'seller@test.com',
          phone: '555-1234',
          description: 'Beautiful Sana Safinaz lawn suit, size M, like new condition'
        }
      };
      const res = createMockRes();

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        productId: 'shopify-123'
      }));
    });

    it('calls Shopify API with correct product structure', async () => {
      const req = {
        method: 'POST',
        body: {
          email: 'test@example.com',
          description: 'Test description of my item'
        }
      };
      const res = createMockRes();

      await submitHandler(req, res);

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.product.status).toBe('draft');
      expect(body.product.product_type).toBe('Pakistani Designer Wear');
      expect(body.product.body_html).toContain('Test description');
      expect(body.product.options).toHaveLength(3);
      expect(body.product.variants[0].inventory_quantity).toBe(1);
    });

    it('includes correct tags for filtering', async () => {
      const req = {
        method: 'POST',
        body: {
          description: 'My designer piece'
        }
      };
      const res = createMockRes();

      await submitHandler(req, res);

      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.product.tags).toContain('web-submission');
      expect(body.product.tags).toContain('preloved');
    });
  });

  describe('POST /api/add-product-image', () => {
    it('returns 405 for non-POST requests', async () => {
      const req = { method: 'GET' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await addImageHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('returns 400 when missing productId', async () => {
      const req = {
        method: 'POST',
        body: { base64: 'abc123' }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await addImageHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing productId or image data' });
    });

    it('uploads image to Shopify successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ image: { id: 'img-456' } })
      });

      const req = {
        method: 'POST',
        body: {
          productId: 'shopify-123',
          base64: 'fakeBase64Data',
          filename: 'photo1.jpg'
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await addImageHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        imageId: 'img-456'
      });
    });
  });
});
