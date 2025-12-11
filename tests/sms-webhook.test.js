// tests/sms-webhook.test.js
// Unit tests for SMS webhook - run with: npm test

import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../api/sms-webhook.js';
import { 
  sendSms, 
  runConversation,
  TEST_PHONES,
  TEST_EMAILS 
} from './test-utils.js';

describe('SMS Webhook', () => {
  
  beforeEach(() => {
    // Reset mock database before each test
    global.mockDb.reset();
  });

  // ═══════════════════════════════════════
  // GLOBAL COMMANDS
  // ═══════════════════════════════════════
  describe('Global Commands', () => {
    
    it('HELP - returns help message from any state', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'help');
      
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('Help');
      expect(res.message).toContain('SELL');
      expect(res.message).toContain('BUY');
      expect(res.message).toContain('STOP');
    });

    it('HELP - works with ? shortcut', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '?');
      
      expect(res.message).toContain('Help');
    });

    it('STOP - unsubscribes user', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'stop');
      
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('unsubscribed');
      
      // Verify state in database
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('unsubscribed');
    });

    it('STOP - blocks further messages', async () => {
      // First unsubscribe
      await sendSms(handler, TEST_PHONES.NEW_USER, 'stop');
      
      // Then try to send another message
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'sell');
      
      expect(res.message).toContain('unsubscribed');
      expect(res.message).toContain('START');
    });

    it('START - resubscribes after STOP', async () => {
      // Unsubscribe
      await sendSms(handler, TEST_PHONES.NEW_USER, 'stop');
      
      // Resubscribe
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'start');
      
      expect(res.message).not.toContain('unsubscribed');
      expect(res.message).toContain('Welcome');
    });

    it('MENU - resets to menu for authorized user', async () => {
      // Setup: Create authorized seller
      global.mockDb.addSeller({
        id: 'seller-1',
        phone: TEST_PHONES.EXISTING_SELLER,
        email: TEST_EMAILS.EXISTING
      });
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'authorized',
        is_authorized: true,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'menu');
      
      expect(res.message).toContain('What would you like to do today');
      expect(res.message).toContain('SELL');
    });
  });

  // ═══════════════════════════════════════
  // PHONE IN SELLERS TABLE
  // ═══════════════════════════════════════
  describe('Phone in Sellers Table', () => {
    
    beforeEach(() => {
      // Setup existing seller
      global.mockDb.addSeller({
        id: 'seller-1',
        phone: TEST_PHONES.EXISTING_SELLER,
        email: TEST_EMAILS.EXISTING,
        paypal_email: TEST_EMAILS.PAYPAL,
        name: 'Test Seller'
      });
    });

    it('NEW state - shows welcome message', async () => {
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'hello');
      
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('Welcome to The Phir Story');
      expect(res.message).toContain('SELL');
      expect(res.message).toContain('BUY');
      expect(res.message).toContain('LISTINGS');
      
      // Verify state updated
      const conv = global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER);
      expect(conv.state).toBe('awaiting_action');
    });

    it('AWAITING_ACTION - unverified user picks sell -> asks for email', async () => {
      // Setup: Create conversation in awaiting_action state
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'awaiting_action',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'sell');
      
      expect(res.message).toContain('verify');
      expect(res.message).toContain('email');
      
      // Verify state and context
      const conv = global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER);
      expect(conv.state).toBe('awaiting_email');
      expect(conv.context.intent).toBe('sell');
    });

    it('AWAITING_EMAIL - correct email verifies user', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'awaiting_email',
        is_authorized: false,
        context: { intent: 'sell' }
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, TEST_EMAILS.EXISTING);
      
      expect(res.message).toContain('verified');
      expect(res.message).toContain('item listed'); // Continues to sell flow
      
      const conv = global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER);
      expect(conv.state).toBe('authorized');
      expect(conv.is_authorized).toBe(true);
    });

    it('AWAITING_EMAIL - paypal email also works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'awaiting_email',
        is_authorized: false,
        context: { intent: 'buy' }
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, TEST_EMAILS.PAYPAL);
      
      expect(res.message).toContain('verified');
    });

    it('AWAITING_EMAIL - wrong email shows attempt count', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'awaiting_email',
        is_authorized: false,
        context: { intent: 'sell' }
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'wrong@email.com');
      
      expect(res.message).toContain("doesn't match");
      expect(res.message).toContain('Attempt 1/3');
    });

    it('AWAITING_EMAIL - 3 wrong attempts resets', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'awaiting_email',
        is_authorized: false,
        context: { intent: 'sell', email_attempts: 2 }
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'wrong@email.com');
      
      expect(res.message).toContain('Too many attempts');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER);
      expect(conv.state).toBe('awaiting_action');
    });

    it('AUTHORIZED - sell intent works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'authorized',
        is_authorized: true,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'sell');
      
      expect(res.message).toContain('item listed');
      expect(res.message).toContain('photos');
    });

    it('AUTHORIZED - buy intent works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'authorized',
        is_authorized: true,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'buy');
      
      expect(res.message).toContain('browse');
      expect(res.message).toContain('thephirstory.com');
    });

    it('AUTHORIZED - listings intent works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'authorized',
        is_authorized: true,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'my listings');
      
      expect(res.message).toContain('listings');
    });

    it('AUTHORIZED - random text shows menu', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'authorized',
        is_authorized: true,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'asdfghjkl');
      
      expect(res.message).toContain('What would you like to do');
    });

    it('AUTHORIZED - number shortcuts work (1, 2, 3)', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        seller_id: 'seller-1',
        state: 'authorized',
        is_authorized: true,
        context: {}
      });
      
      const res1 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '1');
      expect(res1.message).toContain('item listed');
      
      const res2 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '2');
      expect(res2.message).toContain('browse');
      
      const res3 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '3');
      expect(res3.message).toContain('listings');
    });
  });

  // ═══════════════════════════════════════
  // PHONE NOT IN SELLERS TABLE
  // ═══════════════════════════════════════
  describe('Phone NOT in Sellers Table', () => {
    
    it('NEW state - asks if they have account', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'hello');
      
      expect(res.message).toContain('Welcome');
      expect(res.message).toContain('account');
      expect(res.message).toContain('YES');
      expect(res.message).toContain('NO');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('awaiting_account_check');
    });

    it('AWAITING_ACCOUNT_CHECK - YES asks for email', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_account_check',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'yes');
      
      expect(res.message).toContain('email');
      expect(res.message).toContain('signed up');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('awaiting_existing_email');
    });

    it('AWAITING_ACCOUNT_CHECK - NO asks for new email', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_account_check',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'no');
      
      expect(res.message).toContain('create');
      expect(res.message).toContain('email');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('awaiting_new_email');
    });

    it('AWAITING_ACCOUNT_CHECK - gibberish asks again', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_account_check',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'asdfgh');
      
      expect(res.message).toContain('YES');
      expect(res.message).toContain('NO');
    });

    it('AWAITING_EXISTING_EMAIL - found email links phone', async () => {
      // Add existing seller without this phone
      global.mockDb.addSeller({
        id: 'seller-existing',
        phone: '+15550000001', // Different phone
        email: TEST_EMAILS.EXISTING,
        name: 'Existing Seller'
      });
      
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_existing_email',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, TEST_EMAILS.EXISTING);
      
      expect(res.message).toContain('Welcome back');
      expect(res.message).toContain('linked');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('authorized');
      expect(conv.is_authorized).toBe(true);
    });

    it('AWAITING_EXISTING_EMAIL - not found shows retry', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_existing_email',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'notfound@test.com');
      
      expect(res.message).toContain("couldn't find");
      expect(res.message).toContain('Attempt 1/3');
      expect(res.message).toContain('NEW');
    });

    it('AWAITING_EXISTING_EMAIL - typing NEW switches to create', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_existing_email',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'new');
      
      expect(res.message).toContain('email');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('awaiting_new_email');
    });

    it('AWAITING_NEW_EMAIL - creates account', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_new_email',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, TEST_EMAILS.NEW);
      
      expect(res.message).toContain('account is created');
      expect(res.message).toContain('Welcome');
      
      // Verify seller was created
      const seller = global.mockDb.findSellerByEmail(TEST_EMAILS.NEW);
      expect(seller).not.toBeNull();
      expect(seller.phone).toBe(TEST_PHONES.NEW_USER);
      
      // Verify conversation authorized
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('authorized');
      expect(conv.is_authorized).toBe(true);
    });

    it('AWAITING_NEW_EMAIL - email already exists links phone', async () => {
      global.mockDb.addSeller({
        id: 'seller-existing',
        phone: '+15550000001',
        email: TEST_EMAILS.EXISTING
      });
      
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_new_email',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, TEST_EMAILS.EXISTING);
      
      expect(res.message).toContain('already have an account');
      expect(res.message).toContain('linked');
    });

    it('AWAITING_NEW_EMAIL - invalid email rejected', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_new_email',
        is_authorized: false,
        context: {}
      });
      
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'notanemail');
      
      expect(res.message).toContain("doesn't look like a valid email");
    });
  });

  // ═══════════════════════════════════════
  // FULL CONVERSATION FLOWS
  // ═══════════════════════════════════════
  describe('Full Conversation Flows', () => {
    
    it('Flow A: New user creates account and sells', async () => {
      const results = await runConversation(handler, TEST_PHONES.NEW_USER, [
        'hi',           // Welcome + account check
        'no',           // Create new account
        'test@new.com', // Create account
        'sell'          // Start sell flow
      ]);
      
      expect(results[0].received).toContain('account');
      expect(results[1].received).toContain('email');
      expect(results[2].received).toContain('created');
      expect(results[3].received).toContain('item listed');
    });

    it('Flow B: Returning user links phone', async () => {
      // Setup existing seller
      global.mockDb.addSeller({
        id: 'seller-1',
        phone: '+15550000001',
        email: 'returning@test.com',
        name: 'Returning User'
      });
      
      const results = await runConversation(handler, TEST_PHONES.NEW_USER, [
        'hello',             // Welcome + account check
        'yes',               // Has account
        'returning@test.com' // Link phone
      ]);
      
      expect(results[0].received).toContain('account');
      expect(results[1].received).toContain('email');
      expect(results[2].received).toContain('Welcome back');
    });

    it('Flow C: Existing seller verifies and sells', async () => {
      global.mockDb.addSeller({
        id: 'seller-1',
        phone: TEST_PHONES.EXISTING_SELLER,
        email: TEST_EMAILS.EXISTING
      });
      
      const results = await runConversation(handler, TEST_PHONES.EXISTING_SELLER, [
        'hi',                // Welcome menu
        'sell',              // Wants to sell
        TEST_EMAILS.EXISTING // Verify email
      ]);
      
      expect(results[0].received).toContain('SELL');
      expect(results[1].received).toContain('verify');
      expect(results[2].received).toContain('verified');
      expect(results[2].received).toContain('item listed');
    });
  });

  // ═══════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════
  describe('Edge Cases', () => {
    
    it('handles empty message', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '');
      
      expect(res.statusCode).toBe(200);
    });

    it('handles whitespace-only message', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '   ');
      
      expect(res.statusCode).toBe(200);
    });

    it('handles very long message', async () => {
      const longMessage = 'a'.repeat(1000);
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, longMessage);
      
      expect(res.statusCode).toBe(200);
    });

    it('handles special characters', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '!@#$%^&*()');
      
      expect(res.statusCode).toBe(200);
    });

    it('handles emojis', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '👋 hello');
      
      expect(res.statusCode).toBe(200);
    });

    it('GET request returns 405', async () => {
      const req = { method: 'GET' };
      const res = {
        statusCode: null,
        status(code) { this.statusCode = code; return this; },
        json() { return this; }
      };
      
      await handler(req, res);
      
      expect(res.statusCode).toBe(405);
    });
  });

  // ═══════════════════════════════════════
  // RESPONSE FORMAT
  // ═══════════════════════════════════════
  describe('Response Format', () => {
    
    it('returns valid TwiML XML', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'hello');
      
      expect(res.rawBody).toContain('<?xml version="1.0"');
      expect(res.rawBody).toContain('<Response>');
      expect(res.rawBody).toContain('<Message>');
      expect(res.rawBody).toContain('</Message>');
      expect(res.rawBody).toContain('</Response>');
    });

    it('uses CDATA wrapper for special characters', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'hello');
      
      expect(res.rawBody).toContain('<![CDATA[');
      expect(res.rawBody).toContain(']]>');
    });

    it('sets correct Content-Type header', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'hello');
      
      expect(res.headers['Content-Type']).toBe('text/xml');
    });
  });
});
