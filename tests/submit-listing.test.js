// tests/submit-listing.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch for Shopify API calls
global.fetch = vi.fn();

// Mock OpenAI
vi.mock('openai', () => ({
  default: class OpenAI {
    constructor() {
      this.audio = {
        transcriptions: {
          create: vi.fn().mockResolvedValue({ text: 'This is a beautiful Sana Safinaz kurta' })
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

    const submitModule = await import('../api/submit-listing.js');
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

  describe('POST /api/submit-listing', () => {
    it('returns 405 for non-POST requests', async () => {
      const req = { method: 'GET' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('returns 400 when no description provided', async () => {
      const req = {
        method: 'POST',
        body: { email: 'test@test.com', phone: '555-1234' }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Please provide a description' });
    });

    it('creates Shopify draft with description', async () => {
      const req = {
        method: 'POST',
        body: {
          email: 'seller@test.com',
          phone: '555-1234',
          description: 'Beautiful Elan kurta, size M, like new'
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        productId: 'shopify-123'
      }));
    });

    it('calls Shopify API with correct product data', async () => {
      const req = {
        method: 'POST',
        body: {
          email: 'test@example.com',
          phone: '123-456-7890',
          description: 'Test description'
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.product.status).toBe('draft');
      expect(body.product.body_html).toContain('Test description');
      expect(body.product.body_html).toContain('test@example.com');
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

    it('returns 400 when missing base64', async () => {
      const req = {
        method: 'POST',
        body: { productId: '123' }
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
