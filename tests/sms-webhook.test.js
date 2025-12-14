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
      // Since pending_intent is 'sell', should go to sell flow
      expect(res.message).toContain('send anything');

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

      expect(res.message).toContain('send anything');
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
      // Test 1 - sell
      global.mockDb.addConversation({
        phone_number: TEST_PHONES.EXISTING_SELLER,
        state: 'authorized',
        is_authorized: true,
        seller_id: 'seller-123'
      });
      const res1 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '1');
      expect(res1.message).toContain('send anything');

      // Reset state for next test
      global.mockDb.updateConversation(
        global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER).id,
        { state: 'authorized', context: {} }
      );
      const res2 = await sendSms(handler, TEST_PHONES.EXISTING_SELLER, '2');
      expect(res2.message).toContain('Browse');

      // Reset state for next test
      global.mockDb.updateConversation(
        global.mockDb.findConversation(TEST_PHONES.EXISTING_SELLER).id,
        { state: 'authorized', context: {} }
      );
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

  describe('Sell Flow', () => {
    const SELL_PHONE = '+15550001111';

    beforeEach(() => {
      global.mockDb.reset();

      // Create an authorized seller for sell flow tests
      global.mockDb.addSeller({
        id: 'sell-seller-123',
        name: 'Sell Test User',
        email: 'selltest@example.com',
        phone: SELL_PHONE
      });
    });

    describe('Starting Sell Flow', () => {
      it('authorized user says "sell" → state becomes sell_started, returns SELL_START', async () => {
        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'authorized',
          is_authorized: true,
          seller_id: 'sell-seller-123'
        });

        const res = await sendSms(handler, SELL_PHONE, 'sell');

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('send anything');
        expect(res.message).toContain('photo');

        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(conv.state).toBe('sell_started');
      });

      it('SELL_STARTED - user sends item info → creates listing, state becomes sell_collecting', async () => {
        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_started',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {}
        });

        const res = await sendSms(handler, SELL_PHONE, 'Sana Safinaz kurta size M');

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('Got it');

        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(conv.state).toBe('sell_collecting');
        expect(conv.context.listing_id).toBeDefined();

        // Verify listing was created with extracted data
        const listing = global.mockDb.findListing(conv.context.listing_id);
        expect(listing).not.toBeNull();
        expect(listing.listing_data.designer).toBe('Sana Safinaz');
        expect(listing.listing_data.item_type).toBe('kurta');
      });

      it('SELL_STARTED - no data extracted → stays in sell_started', async () => {
        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_started',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {}
        });

        const res = await sendSms(handler, SELL_PHONE, 'hello');

        expect(res.statusCode).toBe(200);

        const conv = global.mockDb.findConversation(SELL_PHONE);
        // Should stay in sell_started since no data was extracted
        expect(conv.state).toBe('sell_started');
      });
    });

    describe('Collecting Listing Data', () => {
      it('SELL_COLLECTING - user provides more data → updates listing', async () => {
        // Create listing first
        const listing = global.mockDb.addListing({
          id: 'test-listing-1',
          seller_id: 'sell-seller-123',
          status: 'incomplete',
          listing_data: { designer: 'Sana Safinaz', item_type: 'kurta' }
        });

        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_collecting',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {
            listing_id: listing.id,
            history: [
              { role: 'user', content: 'Sana Safinaz kurta' },
              { role: 'assistant', content: 'What size?' }
            ]
          }
        });

        const res = await sendSms(handler, SELL_PHONE, 'Size M, like new condition');

        expect(res.statusCode).toBe(200);

        // Verify listing was updated
        const updatedListing = global.mockDb.findListing(listing.id);
        expect(updatedListing.listing_data.size).toBe('M');
        expect(updatedListing.listing_data.condition).toBe('like new');
      });

      it('SELL_COLLECTING - listing not found → restarts sell flow', async () => {
        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_collecting',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {
            listing_id: 'non-existent-listing',
            history: []
          }
        });

        const res = await sendSms(handler, SELL_PHONE, 'Size M');

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('send anything'); // SELL_START message

        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(conv.state).toBe('sell_started');
      });

      it('SELL_COLLECTING - all fields complete → state becomes sell_confirming', async () => {
        // Create listing with most fields already filled
        const listing = global.mockDb.addListing({
          id: 'test-listing-complete',
          seller_id: 'sell-seller-123',
          status: 'incomplete',
          listing_data: {
            designer: 'Elan',
            item_type: 'suit',
            size: 'M',
            condition: 'like new',
            pieces: 3
          }
        });

        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_collecting',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {
            listing_id: listing.id,
            history: []
          }
        });

        // Provide the last missing field (price)
        const res = await sendSms(handler, SELL_PHONE, '$150');

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('YES'); // SELL_CONFIRM message
        expect(res.message).toContain('NO');

        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(conv.state).toBe('sell_confirming');

        // Verify price was saved
        const updatedListing = global.mockDb.findListing(listing.id);
        expect(updatedListing.listing_data.asking_price_usd).toBe(150);
      });
    });

    describe('Confirming Listing', () => {
      it('SELL_CONFIRMING - user says "yes" → status becomes draft, returns SELL_COMPLETE', async () => {
        const listing = global.mockDb.addListing({
          id: 'test-listing-confirm',
          seller_id: 'sell-seller-123',
          status: 'incomplete',
          listing_data: {
            designer: 'Maria B',
            item_type: 'kurta',
            size: 'S',
            condition: 'new with tags',
            asking_price_usd: 200,
            pieces: 3
          }
        });

        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_confirming',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: { listing_id: listing.id }
        });

        const res = await sendSms(handler, SELL_PHONE, 'yes');

        expect(res.statusCode).toBe(200);
        expect(res.message).toContain('ready for review');

        const updatedListing = global.mockDb.findListing(listing.id);
        expect(updatedListing.status).toBe('draft');
      });

      it('SELL_CONFIRMING - user says "no" → allows edits', async () => {
        const listing = global.mockDb.addListing({
          id: 'test-listing-edit',
          seller_id: 'sell-seller-123',
          status: 'incomplete',
          listing_data: {
            designer: 'Khaadi',
            item_type: 'shirt',
            size: 'L',
            condition: 'gently used',
            asking_price_usd: 50,
            pieces: 1
          }
        });

        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_confirming',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: { listing_id: listing.id }
        });

        const res = await sendSms(handler, SELL_PHONE, 'no');

        expect(res.statusCode).toBe(200);
        expect(res.message.toLowerCase()).toContain('change');
      });
    });

    describe('Full Sell Conversation', () => {
      it('complete sell flow: sell → describe item → answer questions → confirm', async () => {
        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'authorized',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {}
        });

        // Step 1: Start sell flow
        let res = await sendSms(handler, SELL_PHONE, 'sell');
        expect(res.message).toContain('send anything');

        // Step 2: Provide initial item info
        res = await sendSms(handler, SELL_PHONE, 'Sana Safinaz 3 piece suit, size M, like new');
        expect(res.message).toContain('Got it');

        // Step 3: Provide price
        res = await sendSms(handler, SELL_PHONE, '$120');

        // Should either ask for more info or be ready to confirm
        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(['sell_collecting', 'sell_confirming']).toContain(conv.state);

        // Verify listing has data
        if (conv.context.listing_id) {
          const listing = global.mockDb.findListing(conv.context.listing_id);
          expect(listing.listing_data.designer).toBe('Sana Safinaz');
          expect(listing.listing_data.asking_price_usd).toBe(120);
        }
      });

      it('sell flow with all data in one message', async () => {
        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_started',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {}
        });

        // Provide all info at once
        const res = await sendSms(
          handler,
          SELL_PHONE,
          'Elan kurta, size S, like new, 3 piece, $200'
        );

        expect(res.statusCode).toBe(200);

        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(conv.context.listing_id).toBeDefined();

        const listing = global.mockDb.findListing(conv.context.listing_id);
        expect(listing.listing_data.designer).toBe('Elan');
        expect(listing.listing_data.size).toBe('S');
        expect(listing.listing_data.condition).toBe('like new');
        expect(listing.listing_data.pieces).toBe(3);
        expect(listing.listing_data.asking_price_usd).toBe(200);
      });
    });

    describe('Sell Flow Edge Cases', () => {
      it('global command MENU during sell flow resets to menu', async () => {
        const listing = global.mockDb.addListing({
          id: 'test-listing-menu',
          seller_id: 'sell-seller-123',
          status: 'incomplete',
          listing_data: { designer: 'Test' }
        });

        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_collecting',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: { listing_id: listing.id }
        });

        const res = await sendSms(handler, SELL_PHONE, 'menu');

        expect(res.message).toContain('What would you like to do');

        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(conv.state).toBe('authorized');
      });

      it('global command HELP during sell flow shows help', async () => {
        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_started',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {}
        });

        const res = await sendSms(handler, SELL_PHONE, 'help');

        expect(res.message).toContain('here to help');
      });

      it('conversation history is preserved across messages', async () => {
        const listing = global.mockDb.addListing({
          id: 'test-listing-history',
          seller_id: 'sell-seller-123',
          status: 'incomplete',
          listing_data: { designer: 'Agha Noor' }
        });

        global.mockDb.addConversation({
          phone_number: SELL_PHONE,
          state: 'sell_collecting',
          is_authorized: true,
          seller_id: 'sell-seller-123',
          context: {
            listing_id: listing.id,
            history: [
              { role: 'user', content: 'Agha Noor kurta' },
              { role: 'assistant', content: 'What size?' }
            ]
          }
        });

        await sendSms(handler, SELL_PHONE, 'Size L');

        const conv = global.mockDb.findConversation(SELL_PHONE);
        expect(conv.context.history.length).toBeGreaterThan(2);

        // Should have user message and assistant response added
        const userMessages = conv.context.history.filter(h => h.role === 'user');
        expect(userMessages.length).toBe(2);
      });
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

  describe('Pending Intent After Verification', () => {
  beforeEach(() => {
    global.mockDb.reset();
  });

  it('should start sell flow after email verification when user originally said sell', async () => {
    // Setup: known seller, not authorized
    global.mockDb.addSeller({
      id: 'seller-1',
      phone: '+1234567890',
      email: 'test@example.com',
      name: 'Test User'
    });
    global.mockDb.addConversation({
      id: 'conv-1',
      phone_number: '+1234567890',
      seller_id: 'seller-1',
      state: 'awaiting_action',
      is_authorized: false,
      context: {}
    });

    // Step 1: User says "sell" - should ask for email verification
    let res = await sendSms(handler, '+1234567890', 'sell');
    expect(res.message.toLowerCase()).toContain('verify');

    // Check that pending_intent was saved correctly
    const conv = global.mockDb.conversations.find(c => c.phone_number === '+1234567890');
    expect(conv.context.pending_intent).toBe('sell');
    expect(conv.state).toBe('awaiting_email');

    // Step 2: User provides correct email - should verify AND start sell flow
    res = await sendSms(handler, '+1234567890', 'test@example.com');
    expect(res.message.toLowerCase()).toContain('verified');
    expect(res.message.toLowerCase()).toContain('send anything');
  });

  it('should start buy flow after email verification when user originally said buy', async () => {
    // Setup: known seller, not authorized
    global.mockDb.addSeller({
      id: 'seller-1',
      phone: '+1234567890',
      email: 'test@example.com',
      name: 'Test User'
    });
    global.mockDb.addConversation({
      id: 'conv-1',
      phone_number: '+1234567890',
      seller_id: 'seller-1',
      state: 'awaiting_action',
      is_authorized: false,
      context: {}
    });

    // Step 1: User says "buy" - should ask for email verification
    let res = await sendSms(handler, '+1234567890', 'buy');
    expect(res.message.toLowerCase()).toContain('verify');

    // Check that pending_intent was saved correctly
    const conv = global.mockDb.conversations.find(c => c.phone_number === '+1234567890');
    expect(conv.context.pending_intent).toBe('buy');

    // Step 2: User provides correct email - should verify AND show buy info
    res = await sendSms(handler, '+1234567890', 'test@example.com');
    expect(res.message.toLowerCase()).toContain('verified');
    expect(res.message.toLowerCase()).toContain('browse');
  });

  it('should start listings flow after email verification when user originally said listings', async () => {
    // Setup: known seller, not authorized
    global.mockDb.addSeller({
      id: 'seller-1',
      phone: '+1234567890',
      email: 'test@example.com',
      name: 'Test User'
    });
    global.mockDb.addConversation({
      id: 'conv-1',
      phone_number: '+1234567890',
      seller_id: 'seller-1',
      state: 'awaiting_action',
      is_authorized: false,
      context: {}
    });

    // Step 1: User says "listings" - should ask for email verification
    let res = await sendSms(handler, '+1234567890', 'my listings');
    expect(res.message.toLowerCase()).toContain('verify');

    // Check that pending_intent was saved correctly
    const conv = global.mockDb.conversations.find(c => c.phone_number === '+1234567890');
    expect(conv.context.pending_intent).toBe('listings');

    // Step 2: User provides correct email - should verify AND show listings
    res = await sendSms(handler, '+1234567890', 'test@example.com');
    expect(res.message.toLowerCase()).toContain('verified');
    expect(res.message.toLowerCase()).toContain('listing');
  });
});
});
