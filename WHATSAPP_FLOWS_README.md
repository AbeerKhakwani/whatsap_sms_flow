# WhatsApp Flows Implementation

## Overview

This implementation uses WhatsApp Flows as the primary UX for listing confirmation. After a seller provides a description via voice or text, the system:

1. Extracts listing data using AI (`/api/validate-listing.js`)
2. Saves to `listings` table in Supabase
3. Sends a WhatsApp Flow (native form UI) prefilled with extracted values
4. On Flow submission, creates Shopify draft product
5. Collects 3+ photos
6. Submits for review

## Architecture

```
User sends "SELL" + description
         ↓
    AI extracts data
         ↓
  Save to listings table
         ↓
 Send WhatsApp Flow (prefilled)
         ↓
User completes/edits form
         ↓
  Flow completion webhook
         ↓
Create Shopify draft product
         ↓
   Request photos (3+ required)
         ↓
    Submit for review
```

## Files

### 1. Flow Definition
**Location:** `/config/whatsapp/flows/confirm-listing.json`

Defines the form structure with 2 screens:
- **Screen 1 (LISTING_DETAILS):** Editable form with all fields
- **Screen 2 (REVIEW):** Read-only summary before submission

**Fields:**
- designer (text, required)
- pieces (dropdown, required): Kurta, 2-piece, 3-piece, Lehnga, Saree, etc.
- style (dropdown, required): Formal, Bridal, Party Wear, etc.
- size (dropdown, required): XS, S, M, L, XL, XXL, One Size, Unstitched
- condition (dropdown, required): New with tags, Like new, Excellent, Good, Fair
- color (text, optional)
- material (text, optional)
- original_price (number, optional)
- asking_price (number, required)
- additional_details (textarea, optional)

### 2. Flow Data Exchange Endpoint
**Location:** `/api/whatsapp-flow.js`

Handles:
- **INIT action:** Returns prefilled data from `listings.extracted_data`
- **data_exchange action:** Validates submitted data against enums
- **Signature verification:** Validates requests from Meta

### 3. Webhook Updates
**Location:** `/api/sms-webhook.js`

**New states:**
- `sell_awaiting_description`: Waiting for user description
- `sell_draft_choice`: Choose to continue or start fresh
- `sell_awaiting_flow`: Flow sent, waiting for completion
- `sell_awaiting_photos`: Waiting for 3+ photos
- `sell_confirming`: Final confirmation before submit

**New functions:**
- `sendWhatsAppFlow()`: Sends Flow message with prefilled data
- `handleFlowCompletion()`: Processes Flow submission, creates Shopify draft
- `parseWhatsAppMessage()`: Now handles `nfm_reply` (Flow completion)

### 4. Database Schema
**Required columns in `listings` table:**

```sql
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES sellers(id),
  source TEXT DEFAULT 'whatsapp',
  status TEXT DEFAULT 'draft',
  extracted_data JSONB,
  flow_submission JSONB,
  shopify_product_id TEXT,
  photo_urls TEXT[],
  last_message_id TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Setup Instructions

### 1. Environment Variables

Add to `.env.local` and Vercel:

```bash
# WhatsApp Credentials
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=1622913521910825
WHATSAPP_VERIFY_TOKEN=tps123
WHATSAPP_APP_SECRET=your_app_secret

# Flow Configuration
WHATSAPP_FLOW_ID=your_flow_id_here
WHATSAPP_FLOW_TOKEN=secure_flow_token_12345

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# OpenAI (for AI extraction)
OPENAI_API_KEY=your_openai_key
```

### 2. Create WhatsApp Flow

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your WhatsApp Business app
3. Navigate to **WhatsApp → Flows**
4. Click **Create Flow**
5. Choose **Upload JSON**
6. Upload `/config/whatsapp/flows/confirm-listing.json`
7. Configure endpoints:
   - **Data Exchange Endpoint:** `https://your-domain.vercel.app/api/whatsapp-flow`
   - **Webhook URL:** `https://your-domain.vercel.app/api/sms-webhook`
8. Copy the **Flow ID** and add to `WHATSAPP_FLOW_ID`
9. **Publish the Flow**

### 3. Configure Webhooks

1. In Meta Developer Console, go to **WhatsApp → Configuration**
2. Set **Webhook URL:** `https://your-domain.vercel.app/api/sms-webhook`
3. Set **Verify Token:** `tps123` (or your custom value)
4. Subscribe to webhook fields:
   - ✅ messages
   - ✅ message_status
   - ✅ messaging_feedback

### 4. Test the Flow

1. Send "START" to your WhatsApp number
2. Complete authentication
3. Send "SELL"
4. Provide a description (voice or text)
5. Complete the Flow form
6. Send 3+ photos
7. Reply "SUBMIT"

## Security Features

✅ **Signature Verification** - X-Hub-Signature-256 validation
✅ **Idempotency** - Prevents duplicate message processing
✅ **Rate Limiting** - Per-phone limits (10 SELL, 5 LOGIN, 20 total/min)
✅ **Media Validation** - MIME type and size checks
✅ **Seller ID Security** - Not set until OTP verified
✅ **Server-side Validation** - Enum values, required fields, price ranges
✅ **24h Messaging Window** - Enforces Meta's messaging policy

## Validation Rules

### Required Fields
- designer (min 2 chars)
- pieces (must be valid enum or "Other" with pieces_other)
- style (must be valid enum or "Other" with style_other)
- size (must be valid enum)
- condition (must be valid enum)
- asking_price (must be > 0 and < $10,000)

### Optional Fields
- color
- material
- original_price (must be valid number if provided)
- additional_details

### Photo Requirements
- Minimum: 3 photos
- Types allowed: image/jpeg, image/png, image/webp
- Max size: 5MB per image

## Troubleshooting

### Flow not sending
- Check `WHATSAPP_FLOW_ID` is correct
- Verify Flow is **Published** in Meta console
- Check logs for "WhatsApp Flow send error"

### Flow submission not working
- Verify `/api/whatsapp-flow` endpoint is accessible
- Check signature verification (WHATSAPP_APP_SECRET)
- Look for "Flow completion error" in logs

### Photos not uploading
- Check media validation limits
- Verify Supabase storage permissions
- Check `processWhatsAppMedia()` function

### Draft not creating in Shopify
- Verify `/api/create-draft` endpoint works
- Check Shopify credentials
- Look for "Create draft error" in logs

## Flow Customization

To modify form fields, edit `/config/whatsapp/flows/confirm-listing.json`:

1. **Add a field:**
   ```json
   {
     "type": "TextInput",
     "name": "new_field",
     "label": "New Field Label",
     "input-type": "text",
     "required": false
   }
   ```

2. **Update dropdown options:**
   ```json
   {
     "type": "Dropdown",
     "name": "condition",
     "data-source": [
       {"id": "new_option", "title": "New Option"}
     ]
   }
   ```

3. **Re-upload to Meta** and **re-publish**

## Notes

- **No sequential Q&A fallback** - Flows are the only UX
- **AI extraction is suggestions only** - User confirms/edits in Flow
- **Commission rate** - Never user-editable, comes from seller record
- **Draft status** - Always `'draft'` until admin approves
- **Photo storage** - Supabase storage bucket, URLs in `photo_urls[]`

## Support

For issues:
1. Check environment variables
2. Review webhook logs in Vercel
3. Test Flow in Meta Flow Builder preview
4. Verify Supabase listings table schema
