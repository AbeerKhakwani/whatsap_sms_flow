// tests/webhook-media.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import handler from '../api/sms-webhook.js';
import { sendSms } from './test-utils.js';

// Mock the media processing module
vi.mock('../lib/sms/media.js', () => ({
  processMediaUrls: vi.fn(),
  getContentType: vi.fn()
}));

describe('Webhook Media Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.mockDb.reset();

    // Mock environment variables
    process.env.TWILIO_ACCOUNT_SID = 'test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_token';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test_key';

    // Add test seller
    global.mockDb.addSeller({
      id: 'seller-123',
      name: 'Test Seller',
      email: 'seller@test.com',
      paypal_email: 'paypal@test.com',
      phone: '+15551234567'
    });
  });

  describe('Media Processing in Webhook', () => {
    it('processes single photo in sell flow', async () => {
      const { processMediaUrls } = await import('../lib/sms/media.js');

      // Mock successful media processing
      processMediaUrls.mockResolvedValue(['https://supabase.co/storage/listing-photos/test.jpg']);

      // Start sell flow with photo
      const res = await sendSms(handler, '+15551234567', 'sell', {
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/test.jpg',
        MessageSid: 'SM123test'
      });

      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('email'); // Should ask for email since not authorized

      // Check that conversation was created with awaiting_email state
      const conv = global.mockDb.findConversation('+15551234567');
      expect(conv.state).toBe('awaiting_email');
      expect(conv.context.pending_intent).toBe('sell');
      expect(conv.context.media_urls).toEqual(['https://supabase.co/storage/listing-photos/test.jpg']);
    });

    it('handles media processing failure gracefully', async () => {
      const { processMediaUrls } = await import('../lib/sms/media.js');

      // Mock media processing failure
      processMediaUrls.mockRejectedValue(new Error('Media processing failed'));

      const res = await sendSms(handler, '+15551234567', 'sell', {
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/bad.jpg',
        MessageSid: 'SM123test'
      });

      // Should show error message
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('wrong');
    });

    it('processes multiple photos', async () => {
      const { processMediaUrls } = await import('../lib/sms/media.js');

      // Mock successful media processing for multiple photos
      processMediaUrls.mockResolvedValue([
        'https://supabase.co/storage/listing-photos/kurta1.jpg',
        'https://supabase.co/storage/listing-photos/kurta2.jpg'
      ]);

      const res = await sendSms(handler, '+15551234567', 'I have these beautiful kurtas', {
        NumMedia: '2',
        MediaUrl0: 'https://api.twilio.com/kurta1.jpg',
        MediaUrl1: 'https://api.twilio.com/kurta2.jpg',
        MessageSid: 'SM123multi'
      });

      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('email'); // Should ask for email since not authorized
    });

    it('skips media processing for non-sellers', async () => {
      // Use a phone that's not in sellers table
      const res = await sendSms(handler, '+15559876543', 'sell', {
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/test.jpg',
        MessageSid: 'SM123test'
      });

      // Should still work, just without media processing
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('Welcome');

      // Verify processMediaUrls was not called (no media processing for non-sellers)
      const { processMediaUrls } = await import('../lib/sms/media.js');
      expect(processMediaUrls).not.toHaveBeenCalled();
    });

    it('continues sell flow after media processing', async () => {
      const { processMediaUrls } = await import('../lib/sms/media.js');

      // Mock successful media processing
      processMediaUrls.mockResolvedValue(['https://supabase.co/storage/listing-photos/test.jpg']);

      // Start sell flow
      await sendSms(handler, '+15551234567', 'sell', {
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/test.jpg',
        MessageSid: 'SM123start'
      });

      // Provide valid email
      await sendSms(handler, '+15551234567', 'seller@test.com');

      // Continue with description
      const res = await sendSms(handler, '+15551234567', 'Beautiful Sana Safinaz kurta, size M, never worn');

      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('Sana Safinaz'); // AI should extract brand
    });
  });

  describe('Media URL Validation', () => {
    it('handles malformed media URLs', async () => {
      const res = await sendSms(handler, '+15551234567', 'sell', {
        NumMedia: '1',
        MediaUrl0: 'not-a-url',
        MessageSid: 'SM123bad'
      });

      // Should handle gracefully
      expect(res.statusCode).toBe(200);
    });

    it('handles empty media URLs', async () => {
      const res = await sendSms(handler, '+15551234567', 'sell', {
        NumMedia: '1',
        MediaUrl0: '',
        MessageSid: 'SM123empty'
      });

      expect(res.statusCode).toBe(200);
    });
  });
});