# SMS Webhook Complete Walkthrough

## 🔄 Full User Journey

```
User sends "SELL"
        ↓
POST /api/sms-webhook (Twilio webhook)
        ↓
Parse message → Get or create conversation
        ↓
State Machine Router
```

---

## 📍 State Machine Flow

### **1️⃣ STATE: `new` or `welcome`**
```
User: "SELL"
        ↓
sendWelcome() - First time message
        ↓
Response: "Hi! 👋 Welcome to The Phir Story..."
```

### **2️⃣ STATE: `awaiting_email` (handleEmail)**
```
User: "ak@gmail.com"
        ↓
✅ Validate email format (must have @ and .)
✅ Check if email exists in sellers table
✅ Check if phone exists in sellers table
✅ Compare email/phone match (security check)
        ↓
❌ If email exists but phone is different:
   Response: "That email is registered to a different number"
   STOP
        ↓
✅ Generate 6-digit code via generateAuthCode()
   - Save to auth_codes table
   - expires_at = now + 10 minutes
   - used = false
        ↓
🚨 SECURITY ISSUE:
   sendMessage() includes the code in WhatsApp!
   Should NOT include code, only tell user to check email
        ↓
Save email to context
Set state → 'awaiting_code'
        ↓
Response: "Check your email for your code. Code: 123456"
              ↑↑↑ THIS IS THE PROBLEM - exposed in chat!
```

### **3️⃣ STATE: `awaiting_code` (handleCode)**
```
User: "123456"
        ↓
Get code from auth_codes table via verifyAuthCode()
        ↓
Query checks:
  ✅ identifier (email) matches
  ✅ code matches exactly
  ✅ used = false (not already used)
  ✅ expires_at > now() (not expired)
        ↓
❌ If any check fails:
   attempts = incrementAuthAttempts()
   
   if (attempts >= 3):
     Set state → 'new' (reset)
     Response: "Too many failed attempts. Reply SELL to try again."
   else:
     Response: "Invalid code. 2 attempts remaining..."
   STOP
        ↓
✅ Code is valid:
   - Mark code as used: UPDATE auth_codes SET used = true
   - Find or CREATE seller:
     - If email doesn't exist: createSeller({ phone, email })
     - If exists: fetch seller
   
   - Authorize conversation:
     UPDATE sms_conversations SET
       is_authorized = true,
       seller_id = seller.id,
       authorized_at = now(),
       state = 'awaiting_description'
   
   - Clear auth_attempts counter
        ↓
Response: "Welcome! ✓\n\nDescribe your item..."
Set state → 'awaiting_description'
```

### **4️⃣ STATE: `awaiting_description` (handleDescription)**
```
User sends voice message OR text
        ↓
If voice: 🎙️ Extract text via speech-to-text
If text: Use raw text
        ↓
extractListingData(description) → Call OpenAI GPT-4o-mini
        ↓
AI extracts:
  - designer (e.g., "Maria B")
  - pieces_included (e.g., "3-piece")
  - size (e.g., "M")
  - condition (e.g., "Like new")
  - asking_price_usd (e.g., 80)
        ↓
Match extracted values to dropdown options
        ↓
Save to context:
  {
    listing_data: {
      designer: "Maria B",
      pieces_included: "3-piece",
      size: "M",
      condition: "Like new",
      asking_price_usd: 80
    }
  }
        ↓
Check missing fields via getMissingFields()
        ↓
If all required fields found:
  Set state → 'sell_photos'
  Response: "Great! Now send at least 3 photos..."
else:
  Set state → 'sell_collecting'
  Response: "What's the [SIZE]?" (ask first missing field)
```

### **5️⃣ STATE: `sell_collecting` (handleMissingField)**
```
User: "M"
        ↓
Validate against dropdown options
        ↓
Save to listing_data
        ↓
Check for MORE missing fields
        ↓
While missing fields exist:
  Response: "What's the [CONDITION]?"
  Wait for response
  Loop back
        ↓
When all fields collected:
  Set state → 'sell_photos'
  Response: "Great! Send at least 3 photos..."
```

### **6️⃣ STATE: `sell_photos` (handlePhoto)**
```
User sends image message
        ↓
message.type === 'image'
        ↓
mediaId = message.image.id
        ↓
handlePhoto(phone, mediaId, conv):
  
  ✅ Deduplicate via Redis:
     redisPhotos.claimPhoto(phone, mediaId)
     If already processed: SKIP (idempotent)
  
  ✅ Download from Twilio API:
     GET mediaUrl via Facebook GraphQL
     Download binary via Twilio auth
  
  ✅ Compress image:
     Sharp library:
       - Auto-rotate EXIF
       - Resize to 1600x1600 (fit inside)
       - Quality 85% JPEG
  
  ✅ Upload to Shopify:
     shopifyGraphQL.uploadPhotoToShopify()
     Returns fileId
  
  ✅ Track in Redis:
     Add to Redis SET (for deduplication)
  
  ✅ Backup to context:
     Add fileId to listing_data.shopify_file_ids[]
        ↓
Response: "Got it! 📸\n\nKeep sending. Text DONE when finished."
        ↓
User: "DONE"
        ↓
handlePhotoState(text='DONE'):
  
  Get all fileIds from Redis
  Count = fileIds.length
  
  if count < 3:
    Response: "Need at least 3 photos. You have 2. Send 1 more."
  else:
    Transfer fileIds to context (sync Redis to DB)
    Clear Redis
    Set state → 'awaiting_additional_details'
```

### **7️⃣ STATE: `awaiting_additional_details` (handleAdditionalDetails)**
```
Bot: "Great! Got 5 photos 📸\n\nAny flaws or special notes?"
Buttons: ["NO, SKIP"] ["YES, ADD"]
        ↓
User clicks "NO, SKIP"
        ↓
Set state → 'sell_confirming'
Call showSummary()
        ↓
OR User clicks "YES, ADD"
        ↓
Set state → 'awaiting_additional_details_text'
Response: "What should buyers know?"
        ↓
User: "Missing one button on sleeve"
        ↓
Save to listing_data.additional_details
Set state → 'sell_confirming'
Call showSummary()
```

### **8️⃣ STATE: `sell_confirming` (handleConfirmation)**
```
showSummary() displays:
  📋 *Ready to submit!*
  
  📦 Maria B 3-piece
  📏 Size: M
  🎨 Pieces: 3-piece
  ✨ Condition: Like new
  💰 Price: $80
  📸 Photos: 5
  📝 Notes: Missing one button on sleeve
  
  Look good?

Buttons: ["YES, SUBMIT ✓"] ["EDIT"] ["CANCEL"]
        ↓
User: "YES, SUBMIT ✓"
        ↓
Call submitListing()
```

### **9️⃣ FINAL STATE: Submit & Create Listing**
```
submitListing():
  
  ✅ Validate 3+ photos exist
  
  ✅ Create Shopify product:
     shopifyGraphQL.createProductWithMedia(productData, fileIds)
     
     API call: GraphQL mutation
       - Create product with title/description
       - Attach all fileIds as media
       - Set metafields: designer, condition, price
     
     Returns: { productId, productUrl }
  
  ✅ Save to DB:
     INSERT INTO listings:
       {
         conversation_id: conv.id,
         seller_id: conv.seller_id,
         status: 'draft',
         designer: "Maria B",
         item_type: "3-piece",
         pieces_included: "3-piece",
         size: "M",
         condition: "Like new",
         asking_price_usd: 80,
         details: "Missing one button",
         shopify_product_id: productId,
         shopify_product_url: productUrl,
         input_method: 'whatsapp'
       }
  
  ✅ Reset conversation:
     smsDb.resetConversation(phone)
     Clear context, state → 'new', is_authorized still true
  
  ✅ Send confirmation:
     Response: "✅ Success!\n\nYour Maria B listing is now in review..."
```

---

## 🔐 Security Points

| Point | Status | Issue |
|-------|--------|-------|
| Email format validation | ✅ | Checks for @ and . |
| Email/Phone matching | ⚠️ | Uses last 10 digits (weak) |
| OTP generation | ✅ | 6-digit random |
| OTP expiry | ✅ | 10 minute timeout |
| OTP marking as used | ✅ | Prevents reuse |
| Code in message | 🔴 | **EXPOSED IN CHAT** |
| Rate limiting | ⚠️ | 3 attempts per phone (can reset) |
| Idempotency | ✅ | Duplicate messages skipped |
| Message processing | ✅ | Marked as processed immediately |

---

## 📊 Database Tables Used

### `sms_conversations`
```javascript
{
  id: UUID,
  phone: "+1234567890",
  seller_id: 123,
  state: "sell_photos", // State machine
  is_authorized: true,
  authorized_at: "2026-01-10T10:30:00Z",
  context: {
    email: "ak@gmail.com",
    listing_data: {
      designer: "Maria B",
      pieces_included: "3-piece",
      size: "M",
      condition: "Like new",
      asking_price_usd: 80,
      additional_details: "..."
    },
    shopify_file_ids: ["fileId1", "fileId2", ...],
    sub_state: null,
    editing_field: null,
    auth_attempts: 0,
    last_auth_attempt: "2026-01-10T10:25:00Z"
  },
  created_at: "2026-01-10T10:20:00Z",
  updated_at: "2026-01-10T10:35:00Z"
}
```

### `sellers`
```javascript
{
  id: 123,
  phone: "+1234567890",
  email: "ak@gmail.com",
  name: "Akbari",
  is_active: true,
  created_at: "2026-01-10T10:20:00Z",
  updated_at: "2026-01-10T10:35:00Z"
}
```

### `auth_codes`
```javascript
{
  id: UUID,
  identifier: "ak@gmail.com", // email (lowercased)
  code: "234567",
  channel: "whatsapp",
  used: false,
  expires_at: "2026-01-10T10:40:00Z", // +10 min from generation
  created_at: "2026-01-10T10:30:00Z"
}
```

### `listings`
```javascript
{
  id: UUID,
  conversation_id: UUID,
  seller_id: 123,
  status: "draft", // draft, approved, published, rejected
  designer: "Maria B",
  item_type: "3-piece",
  pieces_included: "3-piece",
  size: "M",
  condition: "Like new",
  asking_price_usd: 80,
  details: "Missing one button",
  shopify_product_id: "gid://shopify/Product/123456",
  shopify_product_url: "https://thephirstory.myshopify.com/products/maria-b-3pc",
  input_method: "whatsapp",
  created_at: "2026-01-10T10:35:00Z",
  updated_at: "2026-01-10T10:35:00Z"
}
```

---

## 🔧 Key Functions & Their Purpose

| Function | What It Does | When Called |
|----------|---|---|
| `generateAuthCode()` | Create 6-digit code, save to DB | After email validation |
| `verifyAuthCode()` | Check code is valid, mark as used | When user enters code |
| `extractListingData()` | Call OpenAI to parse description | After user describes item |
| `downloadMedia()` | Fetch image from Twilio API | When user sends photo |
| `compressImage()` | Resize & optimize JPEG | After downloading |
| `uploadPhotoToShopify()` | GraphQL mutation to add media | After compress |
| `createProductWithMedia()` | Create Shopify product + attach media | On final submit |
| `showSummary()` | Display confirmation with edit options | Before submit |
| `submitListing()` | Save to DB & create Shopify product | On final "YES" |

---

## 💡 Expected Behavior (Once Fixed)

### Scenario: New User Selling Item

```
User: SELL
Bot: What's your email?

User: ak@gmail.com
Bot: Check your email for verification code.
[Email received: 234567]

User: 234567
Bot: Welcome! Describe your item...

User: Maria B 3-piece, M, like new, $80
Bot: Great! Send at least 3 photos...

[User sends 5 photos - each one uploaded to Shopify]

Bot: Got 5 photos! Any flaws?
User: Yes add

Bot: What should buyers know?
User: Missing one button on sleeve

Bot: [Summary] Look good?
User: Yes, submit

Bot: ✅ Success! Your listing is in review.
    Listing saved to Shopify + database
    User gets seller_id linked to listing
```

---

## ⚠️ Current Issues

1. **Code exposed in WhatsApp** - Remove from message
2. **No email actually sent** - Add `sendVerificationCode()` import
3. **Weak phone matching** - Use exact match, not last 10 digits
4. **Rate limiting can be reset** - Lock email globally, not per phone
5. **No race condition protection** - Add atomic constraint on mark-as-used

