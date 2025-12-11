// tests/test-utils.js
// Helper functions for testing the SMS webhook

/**
 * Create a mock request object simulating Twilio webhook
 */
export function createMockRequest(phone, message) {
  return {
    method: 'POST',
    body: {
      From: phone,
      Body: message
    }
  };
}

/**
 * Create a mock response object that captures the response
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
      this.body = JSON.stringify(data);
      return this;
    }
  };
  
  return res;
}

/**
 * Extract message text from TwiML XML response
 */
export function extractMessageFromXml(xml) {
  const match = xml.match(/<Message>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Message>/);
  return match ? match[1].trim() : null;
}

/**
 * Send a simulated SMS and get the response
 */
export async function sendSms(handler, phone, message) {
  const req = createMockRequest(phone, message);
  const res = createMockResponse();
  
  await handler(req, res);
  
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    rawBody: res.body,
    message: extractMessageFromXml(res.body)
  };
}

/**
 * Run a full conversation flow
 */
export async function runConversation(handler, phone, messages) {
  const results = [];
  
  for (const message of messages) {
    const result = await sendSms(handler, phone, message);
    results.push({
      sent: message,
      received: result.message,
      statusCode: result.statusCode
    });
  }
  
  return results;
}

/**
 * Assert response contains expected text
 */
export function assertContains(response, expected) {
  if (!response.message?.includes(expected)) {
    throw new Error(`Expected response to contain "${expected}" but got: "${response.message}"`);
  }
}

/**
 * Assert response matches one of expected patterns
 */
export function assertMatchesAny(response, patterns) {
  const matches = patterns.some(p => response.message?.includes(p));
  if (!matches) {
    throw new Error(`Expected response to match one of ${JSON.stringify(patterns)} but got: "${response.message}"`);
  }
}

/**
 * Test phone numbers for different scenarios
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
