// tests/media.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase before any imports
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: 'https://supabase.co/storage/listing-photos/test.jpg' }
        }))
      }))
    }
  }))
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('Media Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variables
    process.env.TWILIO_ACCOUNT_SID = 'test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_token';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test_key';
  });

  describe('getContentType', () => {
    it('returns correct MIME types for common extensions', async () => {
      const { getContentType } = await import('../api/sms/media.js');

      expect(getContentType('jpg')).toBe('image/jpeg');
      expect(getContentType('jpeg')).toBe('image/jpeg');
      expect(getContentType('png')).toBe('image/png');
      expect(getContentType('gif')).toBe('image/gif');
      expect(getContentType('webp')).toBe('image/webp');
      expect(getContentType('mp4')).toBe('video/mp4');
      expect(getContentType('mov')).toBe('video/quicktime');
      expect(getContentType('ogg')).toBe('audio/ogg');
      expect(getContentType('mp3')).toBe('audio/mpeg');
      expect(getContentType('wav')).toBe('audio/wav');
    });

    it('returns default MIME type for unknown extensions', async () => {
      const { getContentType } = await import('../api/sms/media.js');

      expect(getContentType('xyz')).toBe('application/octet-stream');
      expect(getContentType('')).toBe('application/octet-stream');
    });
  });

  describe('downloadTwilioMedia', () => {
    it('downloads media from Twilio URL with correct auth headers', async () => {
      const mockBuffer = Buffer.from('fake image data');
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer)
      };

      global.fetch.mockResolvedValue(mockResponse);

      const { downloadTwilioMedia } = await import('../api/sms/media.js');

      const result = await downloadTwilioMedia('https://api.twilio.com/test.jpg');

      expect(global.fetch).toHaveBeenCalledWith('https://api.twilio.com/test.jpg', {
        headers: {
          'Authorization': expect.stringContaining('Basic ')
        }
      });
      expect(result).toEqual(mockBuffer);
    });

    it('throws error on failed download', async () => {
      const mockResponse = {
        ok: false,
        status: 404
      };

      global.fetch.mockResolvedValue(mockResponse);

      const { downloadTwilioMedia } = await import('../api/sms/media.js');

      await expect(downloadTwilioMedia('https://api.twilio.com/test.jpg'))
        .rejects.toThrow('Failed to download media: 404');
    });

    it('throws error on network failure', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const { downloadTwilioMedia } = await import('../api/sms/media.js');

      await expect(downloadTwilioMedia('https://api.twilio.com/test.jpg'))
        .rejects.toThrow('Network error');
    });
  });

  describe('uploadToSupabase', () => {
    it('uploads buffer and returns public URL', async () => {
      const { uploadToSupabase } = await import('../api/sms/media.js');

      const mockBuffer = Buffer.from('fake image data');
      const result = await uploadToSupabase(mockBuffer, 'listings/seller123/test.jpg', 'image/jpeg');

      expect(result).toBe('https://supabase.co/storage/listing-photos/test.jpg');
    });

    it('throws error on upload failure', async () => {
      const { uploadToSupabase, supabase } = await import('../api/sms/media.js');

      // Override the mock for this specific test
      supabase.storage.from.mockReturnValueOnce({
        upload: vi.fn().mockResolvedValue({ data: null, error: new Error('Upload failed') }),
        getPublicUrl: vi.fn()
      });

      const mockBuffer = Buffer.from('fake image data');
      await expect(uploadToSupabase(mockBuffer, 'listings/seller123/test.jpg', 'image/jpeg'))
        .rejects.toThrow('Upload failed');
    });
  });

  describe('processMediaUrls', () => {
    it('processes multiple media URLs successfully', async () => {
      const mockBuffer = Buffer.from('fake image data');

      // Mock Twilio download
      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer)
      });

      const { processMediaUrls } = await import('../api/sms/media.js');

      const urls = await processMediaUrls(
        ['https://api.twilio.com/test.jpg'],
        'seller123',
        'msg123'
      );

      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('supabase.co');
      expect(urls[0]).toContain('listing-photos');
    });

    it('handles empty media URLs array', async () => {
      const { processMediaUrls } = await import('../api/sms/media.js');
      const urls = await processMediaUrls([], 'seller123', 'msg123');
      expect(urls).toEqual([]);
    });

    it('continues processing when one media fails', async () => {
      // First call fails
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      // Second call succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Buffer.from('data'))
      });

      const { processMediaUrls } = await import('../api/sms/media.js');

      const urls = await processMediaUrls(
        ['https://fail.com/test.jpg', 'https://success.com/test.png'],
        'seller123',
        'msg123'
      );

      expect(urls).toHaveLength(1); // Only the successful one
    });

    it('creates correct file paths and names', async () => {
      const mockBuffer = Buffer.from('fake image data');

      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer)
      });

      let capturedFilePath;
      const { processMediaUrls, supabase } = await import('../api/sms/media.js');

      supabase.storage.from.mockReturnValue({
        upload: vi.fn().mockImplementation((path) => {
          capturedFilePath = path;
          return { data: {}, error: null };
        }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://supabase.co/storage/listing-photos/test.jpg' }
        })
      });

      await processMediaUrls(
        ['https://api.twilio.com/photo.jpg'],
        'seller456',
        'SM123abc'
      );

      expect(capturedFilePath).toBe('listings/seller456/SM123abc_1.jpg');
    });

    it('handles different file extensions correctly', async () => {
      const mockBuffer = Buffer.from('fake data');

      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockBuffer)
      });

      let capturedContentType;
      const { processMediaUrls, supabase } = await import('../api/sms/media.js');

      supabase.storage.from.mockReturnValue({
        upload: vi.fn().mockImplementation((path, buffer, options) => {
          capturedContentType = options.contentType;
          return { data: {}, error: null };
        }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://supabase.co/storage/listing-photos/test.png' }
        })
      });

      await processMediaUrls(
        ['https://api.twilio.com/test.png'],
        'seller123',
        'msg123'
      );

      expect(capturedContentType).toBe('image/png');
    });
  });
});