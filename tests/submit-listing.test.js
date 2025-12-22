// tests/submit-listing.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path.jpg' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://test.supabase.co/storage/test/path.jpg' } })
      })
    },
    from: () => ({
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'listing-123', status: 'pending_approval' },
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
    }
  }
}));

describe('Submit Listing API', () => {
  let submitHandler;
  let transcribeHandler;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import handlers fresh each test
    const submitModule = await import('../api/submit-listing.js');
    const transcribeModule = await import('../api/transcribe.js');
    submitHandler = submitModule.default;
    transcribeHandler = transcribeModule.default;
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
      // Base64 encoded audio (mock data)
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

    it('returns 400 when no description or photos provided', async () => {
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
      expect(res.json).toHaveBeenCalledWith({ error: 'Please provide a description or photos' });
    });

    it('creates listing with description only', async () => {
      const req = {
        method: 'POST',
        body: {
          email: 'seller@test.com',
          phone: '555-1234',
          description: 'Beautiful Elan kurta, size M, like new',
          photos: []
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        listingId: 'listing-123'
      });
    });

    it('creates listing with photos', async () => {
      // Mock base64 image data
      const mockPhoto = {
        data: Buffer.from('fake image data').toString('base64'),
        type: 'image/jpeg'
      };

      const req = {
        method: 'POST',
        body: {
          email: 'seller@test.com',
          phone: '555-1234',
          description: 'Sana Safinaz 3-piece',
          photos: [mockPhoto, mockPhoto]
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        listingId: 'listing-123'
      });
    });

    it('creates listing with photos only (no description)', async () => {
      const mockPhoto = {
        data: Buffer.from('fake image').toString('base64'),
        type: 'image/png'
      };

      const req = {
        method: 'POST',
        body: {
          email: '',
          phone: '',
          description: '',
          photos: [mockPhoto]
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        listingId: 'listing-123'
      });
    });

    it('handles multiple photo types', async () => {
      const photos = [
        { data: Buffer.from('jpg').toString('base64'), type: 'image/jpeg' },
        { data: Buffer.from('png').toString('base64'), type: 'image/png' },
        { data: Buffer.from('webp').toString('base64'), type: 'image/webp' }
      ];

      const req = {
        method: 'POST',
        body: {
          email: 'test@example.com',
          phone: '123-456-7890',
          description: 'Multiple photos test',
          photos
        }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await submitHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        listingId: 'listing-123'
      });
    });
  });
});

describe('Submit Listing - Edge Cases', () => {
  let submitHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const submitModule = await import('../api/submit-listing.js');
    submitHandler = submitModule.default;
  });

  it('handles empty photos array', async () => {
    const req = {
      method: 'POST',
      body: {
        email: 'test@test.com',
        phone: '',
        description: 'Just a description',
        photos: []
      }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await submitHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('handles missing email and phone', async () => {
    const req = {
      method: 'POST',
      body: {
        description: 'No contact info provided',
        photos: []
      }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await submitHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
