# Testing WhatsApp Flows

## Manual Testing

### Option 1: Meta Flow Builder Preview (Fastest)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your WhatsApp Business app
3. Navigate to **WhatsApp → Flows**
4. Open your "confirm-listing" Flow
5. Click **Preview** button
6. Test the form with various inputs:
   - Fill all required fields
   - Try "Other" options for pieces/style
   - Test validation (empty required fields, invalid prices)
   - Complete the flow and check the payload

**Pros:** No need for phone number, instant feedback
**Cons:** Doesn't test the full webhook integration

---

### Option 2: WhatsApp Test Number

1. **Get a Test Number:**
   - Go to Meta Developer Console → WhatsApp → API Setup
   - Add your personal phone number as a test recipient
   - You can send/receive messages from your test business number

2. **Test the Full Flow:**
   ```
   You: START
   Bot: [Welcome message + authentication]

   You: [Provide email for OTP]
   Bot: [Sends OTP code]

   You: [Enter OTP code]
   Bot: [Authenticated message + menu]

   You: SELL
   Bot: [Asks for description]

   You: "Sana Safinaz 3-piece, medium, like new, $95"
   Bot: [Sends WhatsApp Flow form]

   You: [Complete form on phone]
   Bot: "✅ Draft created! Now send 3+ photos..."

   You: [Send 3+ photos]
   Bot: "Perfect! Reply SUBMIT or MORE"

   You: SUBMIT
   Bot: "🎉 Listing submitted!"
   ```

**Pros:** Tests real WhatsApp + full webhook flow
**Cons:** Requires actual phone, slower iteration

---

### Option 3: Curl/Postman (API Testing)

Test individual endpoints without WhatsApp:

#### 1. Test Webhook Signature Verification

```bash
# Test webhook with valid signature
curl -X POST https://your-domain.vercel.app/api/sms-webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=YOUR_SIGNATURE" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "15034423865",
            "id": "test_msg_123",
            "type": "text",
            "text": { "body": "SELL" }
          }]
        }
      }]
    }]
  }'
```

#### 2. Test Flow Data Exchange Endpoint

```bash
# Test INIT action (prefill)
curl -X POST https://your-domain.vercel.app/api/whatsapp-flow \
  -H "Content-Type: application/json" \
  -d '{
    "action": "INIT",
    "flow_token": "secure_flow_token_12345",
    "data": {
      "listing_id": "YOUR_LISTING_UUID"
    }
  }'

# Expected response:
# {
#   "version": "4.0",
#   "screen": "LISTING_DETAILS",
#   "data": {
#     "designer": "Sana Safinaz",
#     "pieces": "3-piece",
#     ...
#   }
# }
```

#### 3. Test Flow Submission Validation

```bash
# Test data_exchange with invalid data
curl -X POST https://your-domain.vercel.app/api/whatsapp-flow \
  -H "Content-Type: application/json" \
  -d '{
    "action": "data_exchange",
    "flow_token": "secure_flow_token_12345",
    "screen": "LISTING_DETAILS",
    "data": {
      "designer": "X",
      "pieces": "INVALID",
      "asking_price": "99999"
    }
  }'

# Should return validation errors
```

---

### Option 4: Local Development Testing

1. **Use ngrok for webhook:**
   ```bash
   # Terminal 1: Start your dev server
   npm run dev

   # Terminal 2: Expose to internet
   ngrok http 3000
   ```

2. **Update webhook URL in Meta:**
   - Use ngrok URL: `https://abc123.ngrok.io/api/sms-webhook`

3. **Test with real WhatsApp messages**
   - Watch logs in real-time
   - Iterate quickly

---

## Automated Testing

### Test Structure

```
tests/
├── unit/
│   ├── whatsapp-flow-validation.test.js
│   ├── webhook-security.test.js
│   └── listing-extraction.test.js
├── integration/
│   ├── whatsapp-flow.test.js
│   └── sell-flow-e2e.test.js
└── fixtures/
    ├── webhook-messages.json
    └── flow-submissions.json
```

---

### Unit Tests

Create `/tests/unit/whatsapp-flow-validation.test.js`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

describe('WhatsApp Flow Validation', () => {
  it('should validate required fields', async () => {
    const invalidData = {
      designer: '', // Empty
      pieces: '3-piece',
      style: 'Formal',
      size: 'M',
      condition: 'Like new',
      asking_price: '95'
    };

    const result = validateFlowData(invalidData);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'designer',
      message: 'Designer/Brand is required'
    });
  });

  it('should reject invalid enum values', async () => {
    const invalidData = {
      designer: 'Sana Safinaz',
      pieces: 'INVALID_TYPE',
      style: 'Formal',
      size: 'M',
      condition: 'Like new',
      asking_price: '95'
    };

    const result = validateFlowData(invalidData);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'pieces',
      message: 'Invalid outfit type'
    });
  });

  it('should enforce price limits', async () => {
    const invalidData = {
      designer: 'Sana Safinaz',
      pieces: '3-piece',
      style: 'Formal',
      size: 'M',
      condition: 'Like new',
      asking_price: '99999' // Too high
    };

    const result = validateFlowData(invalidData);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'asking_price',
      message: 'Price seems too high (max $10,000)'
    });
  });

  it('should require pieces_other when pieces is Other', async () => {
    const invalidData = {
      designer: 'Sana Safinaz',
      pieces: 'Other',
      pieces_other: '', // Missing
      style: 'Formal',
      size: 'M',
      condition: 'Like new',
      asking_price: '95'
    };

    const result = validateFlowData(invalidData);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'pieces_other',
      message: 'Please specify the outfit type'
    });
  });

  it('should pass validation with valid data', async () => {
    const validData = {
      designer: 'Sana Safinaz',
      pieces: '3-piece',
      style: 'Formal',
      size: 'M',
      condition: 'Like new',
      asking_price: '95',
      color: 'Maroon',
      material: 'Chiffon'
    };

    const result = validateFlowData(validData);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// Extract validation function for testing
function validateFlowData(data) {
  const errors = [];
  const VALID_ENUMS = {
    pieces: ['Kurta', '2-piece', '3-piece', 'Lehnga Set', 'Saree', 'Sharara Set', 'Gharara Set', 'Anarkali', 'Maxi', 'Other'],
    style: ['Formal', 'Bridal', 'Party Wear', 'Casual', 'Traditional', 'Semi-Formal', 'Festive', 'Other'],
    size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Unstitched'],
    condition: ['New with tags', 'Like new', 'Excellent', 'Good', 'Fair']
  };

  if (!data.designer || data.designer.trim().length < 2) {
    errors.push({ field: 'designer', message: 'Designer/Brand is required' });
  }
  if (!data.pieces) {
    errors.push({ field: 'pieces', message: 'Outfit type is required' });
  } else if (!VALID_ENUMS.pieces.includes(data.pieces)) {
    errors.push({ field: 'pieces', message: 'Invalid outfit type' });
  } else if (data.pieces === 'Other' && !data.pieces_other?.trim()) {
    errors.push({ field: 'pieces_other', message: 'Please specify the outfit type' });
  }
  if (!data.style) {
    errors.push({ field: 'style', message: 'Occasion/Style is required' });
  } else if (!VALID_ENUMS.style.includes(data.style)) {
    errors.push({ field: 'style', message: 'Invalid style' });
  } else if (data.style === 'Other' && !data.style_other?.trim()) {
    errors.push({ field: 'style_other', message: 'Please specify the occasion' });
  }
  if (!data.size) {
    errors.push({ field: 'size', message: 'Size is required' });
  } else if (!VALID_ENUMS.size.includes(data.size)) {
    errors.push({ field: 'size', message: 'Invalid size' });
  }
  if (!data.condition) {
    errors.push({ field: 'condition', message: 'Condition is required' });
  } else if (!VALID_ENUMS.condition.includes(data.condition)) {
    errors.push({ field: 'condition', message: 'Invalid condition' });
  }
  if (!data.asking_price) {
    errors.push({ field: 'asking_price', message: 'Asking price is required' });
  } else {
    const price = parseFloat(data.asking_price);
    if (isNaN(price) || price <= 0) {
      errors.push({ field: 'asking_price', message: 'Price must be greater than 0' });
    } else if (price > 10000) {
      errors.push({ field: 'asking_price', message: 'Price seems too high (max $10,000)' });
    }
  }

  return { valid: errors.length === 0, errors };
}
```

---

### Integration Tests

Create `/tests/integration/whatsapp-flow.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;

function generateSignature(body, secret) {
  return 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
}

describe('WhatsApp Flow Integration', () => {
  let testListingId;
  let testSellerId;

  beforeAll(async () => {
    // Create test seller and listing in Supabase
    const { data: seller } = await supabase
      .from('sellers')
      .insert({ email: 'test@example.com', phone: '+15555551234' })
      .select()
      .single();

    testSellerId = seller.id;

    const { data: listing } = await supabase
      .from('listings')
      .insert({
        seller_id: testSellerId,
        source: 'whatsapp',
        status: 'draft',
        extracted_data: {
          designer: 'Test Designer',
          pieces: '3-piece',
          asking_price: '100'
        }
      })
      .select()
      .single();

    testListingId = listing.id;
  });

  afterAll(async () => {
    // Cleanup
    await supabase.from('listings').delete().eq('id', testListingId);
    await supabase.from('sellers').delete().eq('id', testSellerId);
  });

  it('should handle Flow INIT action with prefill', async () => {
    const payload = {
      action: 'INIT',
      flow_token: process.env.WHATSAPP_FLOW_TOKEN,
      data: { listing_id: testListingId }
    };

    const signature = generateSignature(payload, WHATSAPP_APP_SECRET);

    const response = await fetch(`${BASE_URL}/api/whatsapp-flow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.version).toBe('4.0');
    expect(data.screen).toBe('LISTING_DETAILS');
    expect(data.data.designer).toBe('Test Designer');
    expect(data.data.pieces).toBe('3-piece');
  });

  it('should reject invalid Flow token', async () => {
    const payload = {
      action: 'INIT',
      flow_token: 'invalid_token',
      data: { listing_id: testListingId }
    };

    const signature = generateSignature(payload, WHATSAPP_APP_SECRET);

    const response = await fetch(`${BASE_URL}/api/whatsapp-flow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature
      },
      body: JSON.stringify(payload)
    });

    expect(response.status).toBe(403);
  });

  it('should reject invalid signature', async () => {
    const payload = {
      action: 'INIT',
      flow_token: process.env.WHATSAPP_FLOW_TOKEN,
      data: { listing_id: testListingId }
    };

    const response = await fetch(`${BASE_URL}/api/whatsapp-flow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=invalid'
      },
      body: JSON.stringify(payload)
    });

    expect(response.status).toBe(403);
  });
});
```

---

### E2E Sell Flow Test

Create `/tests/integration/sell-flow-e2e.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Complete SELL Flow (E2E)', () => {
  let testPhone = '+15555559999';
  let testSeller;
  let testListingId;

  beforeAll(async () => {
    // Setup: Create authenticated seller
    const { data: seller } = await supabase
      .from('sellers')
      .insert({
        email: 'sellflow@test.com',
        phone: testPhone
      })
      .select()
      .single();

    testSeller = seller;

    // Create conversation
    await supabase
      .from('sms_conversations')
      .insert({
        phone_number: testPhone,
        seller_id: seller.id,
        state: 'authorized',
        is_authorized: true
      });
  });

  afterAll(async () => {
    // Cleanup
    if (testListingId) {
      await supabase.from('listings').delete().eq('id', testListingId);
    }
    await supabase.from('sms_conversations').delete().eq('phone_number', testPhone);
    await supabase.from('sellers').delete().eq('id', testSeller.id);
  });

  it('should complete full sell flow', async () => {
    // Step 1: Send SELL command
    const sellMessage = createWhatsAppMessage(testPhone, 'SELL');
    let response = await sendWebhookMessage(sellMessage);
    expect(response.status).toBe(200);

    // Step 2: Send description
    const descMessage = createWhatsAppMessage(
      testPhone,
      'Sana Safinaz 3-piece, medium, like new condition, asking $95'
    );
    response = await sendWebhookMessage(descMessage);
    expect(response.status).toBe(200);

    // Verify listing created
    const { data: listing } = await supabase
      .from('listings')
      .select('*')
      .eq('seller_id', testSeller.id)
      .eq('status', 'draft')
      .single();

    expect(listing).toBeTruthy();
    expect(listing.extracted_data.designer).toContain('Sana Safinaz');
    testListingId = listing.id;

    // Step 3: Simulate Flow completion
    const flowMessage = createFlowCompletionMessage(testPhone, {
      designer: 'Sana Safinaz',
      pieces: '3-piece',
      style: 'Formal',
      size: 'M',
      condition: 'Like new',
      asking_price: '95',
      color: 'Maroon',
      material: 'Chiffon'
    });
    response = await sendWebhookMessage(flowMessage);
    expect(response.status).toBe(200);

    // Verify Shopify draft created
    const { data: updatedListing } = await supabase
      .from('listings')
      .select('*')
      .eq('id', testListingId)
      .single();

    expect(updatedListing.shopify_product_id).toBeTruthy();
    expect(updatedListing.flow_submission).toBeTruthy();

    // Step 4: Send photos
    const photoMessage = createWhatsAppImageMessage(testPhone, 'test-image-id');
    response = await sendWebhookMessage(photoMessage);
    expect(response.status).toBe(200);

    // Step 5: Submit
    const submitMessage = createWhatsAppMessage(testPhone, 'SUBMIT');
    response = await sendWebhookMessage(submitMessage);
    expect(response.status).toBe(200);

    // Verify final status
    const { data: finalListing } = await supabase
      .from('listings')
      .select('*')
      .eq('id', testListingId)
      .single();

    expect(finalListing.status).toBe('submitted');
    expect(finalListing.submitted_at).toBeTruthy();
  });
});

// Helper functions
function createWhatsAppMessage(from, text) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: from.replace('+', ''),
            id: `msg_${Date.now()}`,
            type: 'text',
            text: { body: text }
          }]
        }
      }]
    }]
  };
}

function createWhatsAppImageMessage(from, imageId) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: from.replace('+', ''),
            id: `msg_${Date.now()}`,
            type: 'image',
            image: {
              id: imageId,
              mime_type: 'image/jpeg'
            }
          }]
        }
      }]
    }]
  };
}

function createFlowCompletionMessage(from, data) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: from.replace('+', ''),
            id: `msg_${Date.now()}`,
            type: 'interactive',
            interactive: {
              type: 'nfm_reply',
              nfm_reply: {
                name: 'flow',
                body: JSON.stringify(data),
                response_json: JSON.stringify(data)
              }
            }
          }]
        }
      }]
    }]
  };
}

async function sendWebhookMessage(payload) {
  const signature = generateSignature(payload, process.env.WHATSAPP_APP_SECRET);

  return fetch(`${BASE_URL}/api/sms-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signature
    },
    body: JSON.stringify(payload)
  });
}
```

---

### Security Tests

Create `/tests/unit/webhook-security.test.js`:

```javascript
import { describe, it, expect } from 'vitest';

describe('Webhook Security', () => {
  it('should enforce rate limits', async () => {
    const phone = '+15555550000';

    // Send 11 SELL messages (limit is 10/min)
    const requests = [];
    for (let i = 0; i < 11; i++) {
      requests.push(sendWebhookMessage(createWhatsAppMessage(phone, 'SELL')));
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 200 && r.json().status === 'rate_limited');

    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should enforce idempotency', async () => {
    const messageId = `test_idempotent_${Date.now()}`;
    const message = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '15555551111',
              id: messageId,
              type: 'text',
              text: { body: 'TEST' }
            }]
          }
        }]
      }]
    };

    // Send same message twice
    const response1 = await sendWebhookMessage(message);
    const response2 = await sendWebhookMessage(message);

    const data2 = await response2.json();
    expect(data2.status).toBe('duplicate');
  });

  it('should validate media types', async () => {
    const invalidMedia = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '15555552222',
              id: `msg_${Date.now()}`,
              type: 'document',
              document: {
                id: 'test-doc',
                mime_type: 'application/exe' // Not allowed
              }
            }]
          }
        }]
      }]
    };

    const response = await sendWebhookMessage(invalidMedia);
    const data = await response.json();
    expect(data.status).toBe('invalid_media');
  });
});
```

---

## Running Tests

### Setup

1. **Install dependencies:**
   ```bash
   npm install -D vitest @vitest/ui
   ```

2. **Add to `package.json`:**
   ```json
   {
     "scripts": {
       "test": "vitest",
       "test:ui": "vitest --ui",
       "test:unit": "vitest tests/unit",
       "test:integration": "vitest tests/integration",
       "test:coverage": "vitest --coverage"
     }
   }
   ```

3. **Create `vitest.config.js`:**
   ```javascript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       environment: 'node',
       globals: true,
       setupFiles: ['./tests/setup.js']
     }
   });
   ```

4. **Create `tests/setup.js`:**
   ```javascript
   import { createClient } from '@supabase/supabase-js';
   import dotenv from 'dotenv';

   dotenv.config({ path: '.env.local' });

   global.supabase = createClient(
     process.env.VITE_SUPABASE_URL,
     process.env.SUPABASE_SERVICE_KEY
   );

   global.BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
   ```

### Run Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode
npm test -- --watch
```

---

## CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
name: Test WhatsApp Flows

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          WHATSAPP_APP_SECRET: ${{ secrets.WHATSAPP_APP_SECRET }}
          WHATSAPP_FLOW_TOKEN: ${{ secrets.WHATSAPP_FLOW_TOKEN }}

      - name: Run integration tests
        run: npm run test:integration
        env:
          TEST_URL: ${{ secrets.VERCEL_URL }}
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          WHATSAPP_APP_SECRET: ${{ secrets.WHATSAPP_APP_SECRET }}
          WHATSAPP_FLOW_TOKEN: ${{ secrets.WHATSAPP_FLOW_TOKEN }}
```

---

## Test Coverage Goals

- **Unit Tests:** 80%+ coverage
  - Validation functions
  - Security functions
  - Helper functions

- **Integration Tests:** Key flows
  - Flow INIT/completion
  - Webhook message handling
  - Supabase operations

- **E2E Tests:** Critical paths
  - Complete SELL flow
  - Authentication flow
  - Photo upload flow

---

## Mock Data

Create `/tests/fixtures/webhook-messages.json`:

```json
{
  "textMessage": {
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "15034423865",
            "id": "wamid.test123",
            "type": "text",
            "text": { "body": "Test message" }
          }]
        }
      }]
    }]
  },
  "flowCompletion": {
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "15034423865",
            "id": "wamid.flow123",
            "type": "interactive",
            "interactive": {
              "type": "nfm_reply",
              "nfm_reply": {
                "name": "flow",
                "body": "{\"designer\":\"Sana Safinaz\",\"pieces\":\"3-piece\"}",
                "response_json": "{\"designer\":\"Sana Safinaz\",\"pieces\":\"3-piece\"}"
              }
            }
          }]
        }
      }]
    }]
  }
}
```

---

## Quick Test Checklist

### Before Deploy:
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Flow validates in Meta preview
- [ ] Webhook signature verification works
- [ ] Rate limiting enforced
- [ ] Idempotency working
- [ ] Media validation working

### After Deploy:
- [ ] Send test message to WhatsApp
- [ ] Complete full SELL flow
- [ ] Submit listing
- [ ] Check Supabase for data
- [ ] Verify Shopify draft created

---

## Troubleshooting Tests

### Tests failing locally but passing in CI
- Check environment variables
- Verify Supabase test data exists
- Check network/CORS issues

### Flow tests failing
- Verify WHATSAPP_FLOW_ID is correct
- Check Flow is published in Meta
- Validate JSON schema

### Integration tests timeout
- Increase timeout in vitest.config.js
- Check if dev server is running
- Verify ngrok/tunnel if needed

---

## Next Steps

1. **Implement unit tests first** - Fast feedback
2. **Add integration tests** - Verify endpoints
3. **Create E2E test** - Full flow validation
4. **Setup CI/CD** - Automated testing on push
5. **Monitor in production** - Real user testing
