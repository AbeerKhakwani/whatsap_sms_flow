// tests/test-utils.js
// Helper functions for testing the WhatsApp webhook

/**
 * Create a mock WhatsApp Cloud API request
 */
export function createMockRequest(phone, message, extraParams = {}) {
  return {
    method: 'POST',
    body: {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: phone.replace('+', ''),
              id: `msg_${Date.now()}`,
              type: 'text',
              text: { body: message }
            }]
          }
        }]
      }],
      ...extraParams
    }
  };
}

/**
 * Create a mock response object
 */
export function createMockResponse() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },

    send(body) {
      this.body = body;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    }
  };

  return res;
}

/**
 * Send a simulated WhatsApp message and get the response
 */
export async function sendMessage(handler, phone, message, extraParams = {}) {
  const req = createMockRequest(phone, message, extraParams);
  const res = createMockResponse();

  await handler(req, res);

  return {
    statusCode: res.statusCode,
    body: res.body
  };
}

/**
 * Test phone numbers
 */
export const TEST_PHONES = {
  EXISTING_SELLER: '+15551234567',
  NEW_USER: '+15559876543',
  UNSUBSCRIBED: '+15550000000'
};

/**
 * Test emails
 */
export const TEST_EMAILS = {
  EXISTING: 'existing@test.com',
  PAYPAL: 'paypal@test.com',
  NEW: 'newuser@test.com',
  INVALID: 'notanemail'
};
