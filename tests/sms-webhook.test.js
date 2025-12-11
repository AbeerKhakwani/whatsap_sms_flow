// tests/sms-webhook.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../api/sms-webhook.js';
import { sendSms, runConversation } from './test-utils.js';

// Test phone numbers
const TEST_PHONES = {
  EXISTING_SELLER: '+15551234567',
  NEW_USER: '+15559876543'
};

// Test emails
const TEST_EMAILS = {
  EXISTING: 'seller@test.com',
  PAYPAL: 'paypal@test.com',
  NEW: 'newuser@test.com'
};

describe('SMS Webhook', () => {
  beforeEach(() => {
    global.mockDb.reset();
    
    global.mockDb.addSeller({
      id: 'seller-123',
      name: 'Test Seller',
      email: TEST_EMAILS.EXISTING,
      paypal_email: TEST_EMAILS.PAYPAL,
      phone: TEST_PHONES.EXISTING_SELLER
    });
  });

  describe('Global Commands', () => {
    it('HELP - returns help message from any state', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'help');
      
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('here to help');
      expect(res.message).toContain('SELL');
      expect(res.message).toContain('BUY');
    });

    it('HELP - works with ? shortcut', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '?');
      
      expect(res.message).toContain('here to help');
    });

    it('STOP - unsubscribes user', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'stop');
      
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('unsubscribed');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('unsubscribed');
    });

    it('STOP - blocks further messages', async () => {
      await sendSms(handler, TEST_PHONES.NEW_USER, 'stop');
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'sell');
      
      expect(res.message).toContain('unsubscribed');
      expect(res.message).toContain('START');
    });

    it('START - resubscribes after STOP', async () => {
      await sendSms(handler, TEST_PHONES.NEW_USER, 'stop');
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'start');
      
      expect(res.message).not.toContain('unsubscribed');
      expect(res.message).toContain('Welcome');
    });

    it('MENU - resets to menu for authorized user', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'authorized',
        is_authorized: true,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'menu');
      
      expect(res.message).toContain('What would you like to do');
      expect(res.message).toContain('SELL');
    });
  });

  describe('Phone in Sellers Table', () => {
    it('NEW state - shows welcome message', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'new',
        is_authorized: false,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'hi');
      
      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('Welcome');
      expect(res.message).toContain('SELL');
      expect(res.message).toContain('BUY');
    });

    it('AWAITING_ACTION - unverified user picks sell -> asks for email', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'awaiting_action',
        is_authorized: false,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'sell');
      
      expect(res.message).toContain('verify');
      expect(res.message).toContain('email');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER);
      expect(conv.state).toBe('awaiting_email');
    });

    it('AWAITING_EMAIL - correct email verifies user', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'awaiting_email',
        is_authorized: false,
        seller_id: 'seller-123',
        context: { pending_intent: 'sell' }
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, TEST_EMAILS.EXISTING);
      
      expect(res.message).toContain('verified');
      expect(res.message).toContain('What would you like to do');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER);
      expect(conv.is_authorized).toBe(true);
    });

    it('AWAITING_EMAIL - paypal email also works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'awaiting_email',
        is_authorized: false,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, TEST_EMAILS.PAYPAL);
      
      expect(res.message).toContain('verified');
    });

    it('AWAITING_EMAIL - wrong email shows attempt count', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'awaiting_email',
        is_authorized: false,
        seller_id: 'seller-123',
        context: { pending_intent: 'sell' }
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'wrong@email.com');
      
      expect(res.message).toContain("doesn't match");
      expect(res.message).toContain('Attempt 1/3');
    });

    it('AWAITING_EMAIL - 3 wrong attempts resets', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'awaiting_email',
        is_authorized: false,
        seller_id: 'seller-123',
        context: { pending_intent: 'sell', email_attempts: 2 }
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'wrong@email.com');
      
      expect(res.message).toContain('start fresh');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER);
      expect(conv.state).toBe('awaiting_action');
    });

    it('AUTHORIZED - sell intent works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'authorized',
        is_authorized: true,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'sell');
      
      expect(res.message).toContain('list');
    });

    it('AUTHORIZED - buy intent works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'authorized',
        is_authorized: true,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'buy');
      
      expect(res.message).toContain('Browse');
    });

    it('AUTHORIZED - listings intent works', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'authorized',
        is_authorized: true,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'my listings');
      
      expect(res.message).toContain('listing');
    });

    it('AUTHORIZED - random text shows menu', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'authorized',
        is_authorized: true,
        seller_id: 'seller-123'
      });

      const res = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, 'asdfghjkl');
      
      expect(res.message).toContain('What would you like to do');
    });

    it('AUTHORIZED - number shortcuts work (1, 2, 3)', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'authorized',
        is_authorized: true,
        seller_id: 'seller-123'
      });

      const res1 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '1');
      expect(res1.message).toContain('list');

      const res2 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '2');
      expect(res2.message).toContain('Browse');

      const res3 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '3');
      expect(res3.message).toContain('listing');
    });
  });

  describe('Phone NOT in Sellers Table', () => {
    it('NEW state - asks if they have account', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'hello');
      
      expect(res.message).toContain('Welcome');
      expect(res.message).toContain('YES');
      expect(res.message).toContain('NO');
    });

    it('AWAITING_ACCOUNT_CHECK - YES asks for email', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_account_check',
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'yes');
      
      expect(res.message).toContain('email');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('awaiting_existing_email');
    });

    it('AWAITING_ACCOUNT_CHECK - NO asks for new email', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_account_check',
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'no');
      
      expect(res.message).toContain('email');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('awaiting_new_email');
    });

    it('AWAITING_ACCOUNT_CHECK - gibberish asks again', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_account_check',
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'asdfghjkl');
      
      expect(res.message).toContain('YES');
      expect(res.message).toContain('NO');
    });

    it('AWAITING_EXISTING_EMAIL - found email links phone', async () => {
      global.mockDb.addSeller({
        id: 'existing-seller',
        name: 'Existing Seller',
        email: 'existing@test.com',
        phone: null
      });

      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_existing_email',
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'existing@test.com');
      
      expect(res.message).toContain('Welcome back');
      expect(res.message).toContain('linked');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.is_authorized).toBe(true);
    });

    it('AWAITING_EXISTING_EMAIL - not found shows retry', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_existing_email',
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'notfound@test.com');
      
      expect(res.message).toContain("couldn't find");
      expect(res.message).toContain('Attempt 1/3');
    });

    it('AWAITING_EXISTING_EMAIL - typing NEW switches to create', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_existing_email',
        is_authorized: false
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
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, TEST_EMAILS.NEW);
      
      expect(res.message).toContain('done');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.is_authorized).toBe(true);
    });

    it('AWAITING_NEW_EMAIL - existing email links instead of creating', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_new_email',
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, TEST_EMAILS.EXISTING);
      
      expect(res.message).toContain('already has an account');
      expect(res.message).toContain('linked');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.is_authorized).toBe(true);
    });

    it('AWAITING_NEW_EMAIL - invalid email rejected', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.NEW_USER,
        state: 'awaiting_new_email',
        is_authorized: false
      });

      const res = await sendSms(handler, TEST_PHONES.NEW_USER, 'notanemail');
      
      expect(res.message).toContain('email');
      
      const conv = global.mockDb.findConversation(TEST_PHONES.NEW_USER);
      expect(conv.state).toBe('awaiting_new_email');
    });
  });

  describe('Full Conversation Flows', () => {
    it('New user full flow: hello -> no -> email -> menu', async () => {
      const messages = await runConversation(handler, TEST_PHONES.NEW_USER, [
        'hello',
        'no',
        'brand_new@test.com'
      ]);
      
      expect(messages[0]).toContain('Welcome');
      expect(messages[1]).toContain('email');
      expect(messages[2]).toContain('done');
    });

    it('Returning user flow: hello -> yes -> email -> menu', async () => {
      global.mockDb.addSeller({
        id: 'return-seller',
        name: 'Return User',
        email: 'return@test.com',
        phone: null
      });

      const messages = await runConversation(handler, TEST_PHONES.NEW_USER, [
        'hi',
        'yes',
        'return@test.com'
      ]);
      
      expect(messages[0]).toContain('Welcome');
      expect(messages[1]).toContain('email');
      expect(messages[2]).toContain('Welcome back');
    });

    it('Known seller verification flow', async () => {
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'awaiting_action',
        is_authorized: false,
        seller_id: 'seller-123'
      });

      const messages = await runConversation(handler, TEST_PHONES.EXISTING_SELLER, [
        'sell',
        TEST_EMAILS.EXISTING
      ]);
      
      expect(messages[0]).toContain('verify');
      expect(messages[1]).toContain('verified');
    });
  });

  describe('Edge Cases', () => {
    it('Empty message handled gracefully', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '');
      
      expect(res.statusCode).toBe(200);
    });

    it('Very long message handled', async () => {
      const longMsg = 'a'.repeat(1000);
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, longMsg);
      
      expect(res.statusCode).toBe(200);
    });

    it('Special characters in message', async () => {
      const res = await sendSms(handler, TEST_PHONES.NEW_USER, '💕 Hello! @#$%');
      
      expect(res.statusCode).toBe(200);
    });

    it('Case insensitive commands', async () => {
      const res1 = await sendSms(handler, TEST_PHONES.NEW_USER, 'HELP');
      const res2 = await sendSms(handler, TEST_PHONES.NEW_USER, 'help');
      const res3 = await sendSms(handler, TEST_PHONES.NEW_USER, 'Help');
      
      expect(res1.message).toContain('here to help');
      expect(res2.message).toContain('here to help');
      expect(res3.message).toContain('here to help');
    });
  });
});
