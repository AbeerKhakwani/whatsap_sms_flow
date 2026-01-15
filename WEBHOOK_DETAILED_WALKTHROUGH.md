# SMS Webhook Deep Dive - Extended Walkthrough

## 📱 Real-World Example Scenarios

---

## 🎯 Scenario 1: New User (Akbari) - Happy Path

### Initial State
```
User phone: +923001234567
Database: Empty - no seller, no conversation
```

### **STEP 1: User sends "SELL"**
```
Twilio sends POST /api/sms-webhook
{
  entry: [{
    changes: [{
      value: {
        messages: [{
          from: "+923001234567",
          id: "wamid.xyz123",
          type: "text",
          text: { body: "SELL" }
        }]
      }
    }]
  }]
}

Webhook processes:
  ✅ message.from = "+923001234567"
  ✅ message.id = "wamid.xyz123"
  ✅ text = "SELL"
  
  smsDb.findOrCreateConversation("+923001234567")
    → CREATE new row in sms_conversations
    → Returns: {
        phone: "+923001234567",
        seller_id: null,
        is_authorized: false,
        state: "new",
        context: {}
      }
  
  ✅ Mark message as processed:
     smsDb.markMessageProcessed("+923001234567", "wamid.xyz123")
  
  cmd = "sell"
  → Match: handleSellCommand()
  
  Check: conv.is_authorized? NO
  
  → smsDb.setState("+923001234567", "awaiting_email")
  
  → sendMessage("+923001234567", "What's your email?")
```

**WhatsApp Bot:** "What's your email?"

---

### **STEP 2: User sends "ak@gmail.com"**
```
Webhook receives:
{
  from: "+923001234567",
  id: "wamid.xyz124",
  text: { body: "ak@gmail.com" }
}

Current state: "awaiting_email"
→ handleEmail("+923001234567", "ak@gmail.com", conv)

email = "ak@gmail.com" (lowercased)

✅ Validate format:
   "ak@gmail.com".includes("@") ✓
   "ak@gmail.com".includes(".") ✓

✅ Check if seller exists:
   smsDb.findSellerByEmail("ak@gmail.com")
   → Query: SELECT * FROM sellers WHERE email = 'ak@gmail.com'
   → No result (NEW USER)
   → sellerByEmail = null
   
   smsDb.findSellerByPhone("+923001234567")
   → Query: SELECT * FROM sellers WHERE phone = '+923001234567'
   → No result (NEW USER)
   → sellerByPhone = null

✅ No mismatches (both are null)

✅ Generate auth code:
   generateAuthCode("ak@gmail.com", "+923001234567")
   
   code = crypto.randomInt(100000, 999999)
   code = "467829"
   
   INSERT INTO auth_codes:
   {
     identifier: "ak@gmail.com",
     code: "467829",
     channel: "whatsapp",
     expires_at: 2026-01-10T14:40:00Z (now + 10 min),
     used: false,
     created_at: 2026-01-10T14:30:00Z
   }

✅ Save email to context:
   smsDb.updateContext("+923001234567", {
     email: "ak@gmail.com",
     pending_seller_id: null
   })

✅ Update state:
   smsDb.setState("+923001234567", "awaiting_code")

→ sendMessage():
   "Check your email for your code.\n\nReply with the 6-digit code to verify.\n\nCode: 467829"
   ⚠️ SECURITY ISSUE: Code is visible!
```

**WhatsApp Bot:** "Check your email for your code. Code: 467829" ❌

**Email sent?** NO ❌ (Should send verification email but doesn't)

---

### **STEP 3: User sends "467829"**
```
Webhook receives:
{
  from: "+923001234567",
  id: "wamid.xyz125",
  text: { body: "467829" }
}

Current state: "awaiting_code"
→ handleCode("+923001234567", "467829", conv)

code = "467829"
email = conv.context.email = "ak@gmail.com"

✅ verifyAuthCode("ak@gmail.com", "467829"):
   
   Query auth_codes:
   SELECT * FROM auth_codes
   WHERE identifier = 'ak@gmail.com'
     AND code = '467829'
     AND used = false
     AND expires_at > NOW()
   ORDER BY created_at DESC
   LIMIT 1
   
   ✅ Found matching record
   
   UPDATE auth_codes SET used = true WHERE id = <id>
   
   return true

✅ Code verified!

✅ Find or create seller:
   smsDb.findSellerByEmail("ak@gmail.com")
   → No existing seller
   
   smsDb.createSeller({ phone: "+923001234567", email: "ak@gmail.com" })
   
   INSERT INTO sellers:
   {
     phone: "+923001234567",
     email: "ak@gmail.com",
     name: null,
     is_active: true,
     created_at: NOW(),
     updated_at: NOW()
   }
   
   Returns: seller = { id: 42, phone, email, ... }

✅ Authorize conversation:
   smsDb.authorize("+923001234567", 42, "ak@gmail.com")
   
   UPDATE sms_conversations SET
     is_authorized = true,
     seller_id: 42,
     authorized_at: NOW(),
     state: 'awaiting_description',
     auth_attempts: 0
   WHERE phone = '+923001234567'

✅ Send welcome:
   greeting = "Welcome! ✓"
   
   sendMessage("+923001234567",
     "Welcome! ✓\n\n" +
     "Describe your item (voice or text):\n" +
     "Designer, size, condition, price\n\n" +
     "Example: 'Maria B lawn 3pc, M, like new, $80'"
   )
```

**WhatsApp Bot:** "Welcome! ✓ Describe your item..."

---

### **STEP 4: User sends voice message**
```
Twilio sends:
{
  from: "+923001234567",
  id: "wamid.xyz126",
  type: "audio",
  audio: { id: "MEDIA_ID_123" }
}

Current state: "awaiting_description"
→ handleDescription() [if text]
   OR audio transcription first

🎙️ Transcribe audio → Get text
   "I have a Maria B lawn 3 piece suit, medium size, maroon with gold embroidery.
    Worn once for a wedding, like new condition. Original price was 250, asking 85 dollars."

✅ extractListingData(description):
   
   Call OpenAI GPT-4o-mini with system prompt:
   "Extract: pieces_included, size, condition, price"
   
   Response JSON:
   {
     "designer": "Maria B",
     "pieces_included": "3-piece",
     "size": "M",
     "condition": "Like new",
     "asking_price_usd": 85,
     "item_type": "Maria B 3-piece"
   }

✅ Match to dropdown options:
   pieces_included: "3-piece" → matches dropdown ✓
   size: "M" → matches dropdown ✓
   condition: "Like new" → matches dropdown ✓

✅ Get missing required fields:
   REQUIRED_FIELDS = ['designer', 'pieces_included', 'size', 'condition', 'asking_price_usd']
   
   Current listing_data = {
     designer: "Maria B",
     pieces_included: "3-piece",
     size: "M",
     condition: "Like new",
     asking_price_usd: 85
   }
   
   Missing = [] (NONE!)

✅ All fields present → Move to photos
   smsDb.setState("+923001234567", "sell_photos")
   
   sendMessage("+923001234567",
     "Great! Now send at least 3 photos.\n\n" +
     "1. Front view\n" +
     "2. Back view\n" +
     "3. Tag/Label\n\n" +
     "Send photos or text DONE when finished"
   )
```

**WhatsApp Bot:** "Great! Now send at least 3 photos..."

---

### **STEP 5: User sends 5 photos**
```
For each photo sent:

Twilio sends:
{
  from: "+923001234567",
  id: "wamid.photo_1",
  type: "image",
  image: { id: "MEDIA_ID_PHOTO_1", mime_type: "image/jpeg" }
}

Current state: "sell_photos"
message.type === "image"
→ handlePhoto("+923001234567", "MEDIA_ID_PHOTO_1", conv)

Step 1: Deduplicate via Redis
────────────────────────────
  redisPhotos.claimPhoto("+923001234567", "MEDIA_ID_PHOTO_1")
  
  Key: "photos:+923001234567"
  Type: SET
  Action: SADD "photos:+923001234567" "MEDIA_ID_PHOTO_1"
  
  If FIRST time: returns 1 (new)
  If DUPLICATE: returns 0 (already seen)
  
  → Proceed (new photo)

Step 2: Download from Twilio
────────────────────────────
  downloadMedia("MEDIA_ID_PHOTO_1")
  
  GET https://graph.facebook.com/v21.0/MEDIA_ID_PHOTO_1?access_token=TOKEN
  Response: { url: "https://platform.twiliocdn.com/media/..." }
  
  GET https://platform.twiliocdn.com/media/...
  Authorization: Bearer WHATSAPP_TOKEN
  Response: Binary image data

Step 3: Compress image
──────────────────────
  compressImage(buffer)
  
  Using Sharp library:
    - Auto-rotate based on EXIF
    - Resize to fit 1600x1600
    - Compress to JPEG quality 85
  
  Before: 4.2 MB
  After: 450 KB (89.3%)
  
  Result: compressed_buffer

Step 4: Upload to Shopify
─────────────────────────
  shopifyGraphQL.uploadPhotoToShopify(compressed_buffer, "wa_MEDIA_ID_PHOTO_1.jpg")
  
  GraphQL mutation: fileCreate
  {
    mutation fileCreate($input: FileInput!) {
      fileCreate(input: $input) {
        files { id, createdAt }
        userErrors { message }
      }
    }
    variables: {
      input: {
        originalSource: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
        contentType: "IMAGE"
      }
    }
  }
  
  Response: { fileId: "gid://shopify/File/123456789" }

Step 5: Track in Redis
──────────────────────
  redisPhotos.addPhoto("+923001234567", fileId, "MEDIA_ID_PHOTO_1")
  
  ZADD "photos:+923001234567" 1 fileId (with timestamp)
  count = 1

Step 6: Backup to context
──────────────────────────
  smsDb.updateContext("+923001234567", {
    shopify_file_ids: ["gid://shopify/File/123456789"]
  })

→ sendMessage("+923001234567", "Got it! 📸\n\nKeep sending. Text DONE when finished.")

[User sends 4 more photos - same process repeats]

After 5 photos:
- Redis contains: 5 fileIds
- Context contains: 5 fileIds (backup)
- Photos: 1.2 MB total → 2.2 MB total (compressed)
```

**WhatsApp Bot:** "Got it! 📸 Keep sending..."

---

### **STEP 6: User sends "DONE"**
```
Webhook receives:
{
  from: "+923001234567",
  id: "wamid.xyz127",
  text: { body: "DONE" }
}

Current state: "sell_photos"
→ handlePhotoState("+923001234567", "DONE", buttonId=null, conv)

userText = "done"

if (userText === 'done'):
  ✅ fileIds = await redisPhotos.getPhotos("+923001234567")
     → Returns all 5 fileIds from Redis
  
  photoCount = 5
  
  if (photoCount < 3):
    → Send "Need more"
  else:
    ✅ Transfer to context (already there, but sync):
       smsDb.updateContext("+923001234567", {
         shopify_file_ids: fileIds
       })
    
    ✅ Clear Redis:
       redisPhotos.clearPhotos("+923001234567")
       → DEL "photos:+923001234567"
    
    ✅ Update state:
       smsDb.setState("+923001234567", "awaiting_additional_details")
    
    ✅ Ask about flaws:
       sendButtons("+923001234567",
         "Great! Got 5 photos 📸\n\nAny flaws or special notes?",
         [
           { id: 'skip_details', title: 'NO, SKIP' },
           { id: 'add_details', title: 'YES, ADD' }
         ]
       )
```

**WhatsApp Bot:** 
```
Great! Got 5 photos 📸

Any flaws or special notes?

[NO, SKIP] [YES, ADD]
```

---

### **STEP 7: User clicks "YES, ADD"**
```
Webhook receives:
{
  from: "+923001234567",
  id: "wamid.xyz128",
  type: "interactive",
  interactive: {
    button_reply: { id: "add_details", title: "YES, ADD" }
  }
}

Current state: "awaiting_additional_details"
→ handleAdditionalDetails("+923001234567", text, buttonId="add_details", conv)

if (buttonId === 'add_details'):
  ✅ smsDb.setState("+923001234567", "awaiting_additional_details_text")
  
  ✅ sendMessage("+923001234567",
       "What should buyers know? (flaws, measurements, notes)"
     )
```

**WhatsApp Bot:** "What should buyers know?"

---

### **STEP 8: User sends "Missing one button on left sleeve"**
```
Webhook receives:
{
  from: "+923001234567",
  id: "wamid.xyz129",
  text: { body: "Missing one button on left sleeve" }
}

Current state: "awaiting_additional_details_text"
→ handleAdditionalDetailsText("+923001234567", text, conv)

✅ Save to listing_data:
   listing = conv.context.listing_data
   listing.additional_details = "Missing one button on left sleeve"
   
   smsDb.updateContext("+923001234567", { listing_data: listing })

✅ Call showSummary()
   smsDb.setState("+923001234567", "sell_confirming")
   
   summary = `
     📋 *Ready to submit!*
     
     📦 Maria B 3-piece
     📏 Size: M
     🎨 Pieces: 3-piece
     ✨ Condition: Like new
     💰 Price: $85
     📸 Photos: 5
     📝 Notes: Missing one button on left sleeve
     
     Look good?
   `
   
   sendButtons("+923001234567", summary, [
     { id: 'submit', title: 'YES, SUBMIT ✓' },
     { id: 'edit_fields', title: 'EDIT' },
     { id: 'cancel', title: 'CANCEL' }
   ])
```

**WhatsApp Bot:**
```
📋 *Ready to submit!*

📦 Maria B 3-piece
📏 Size: M
🎨 Pieces: 3-piece
✨ Condition: Like new
💰 Price: $85
📸 Photos: 5
📝 Notes: Missing one button on left sleeve

Look good?

[YES, SUBMIT ✓] [EDIT] [CANCEL]
```

---

### **STEP 9: User clicks "YES, SUBMIT ✓"**
```
Webhook receives:
{
  from: "+923001234567",
  id: "wamid.xyz130",
  type: "interactive",
  interactive: {
    button_reply: { id: "submit", title: "YES, SUBMIT ✓" }
  }
}

Current state: "sell_confirming"
→ handleConfirmation("+923001234567", text, buttonId="submit", conv)

if (buttonId === 'submit' OR text.includes('yes')):
  ✅ submitListing("+923001234567", conv)
  
  listing = {
    designer: "Maria B",
    item_type: "3-piece",
    pieces_included: "3-piece",
    size: "M",
    condition: "Like new",
    asking_price_usd: 85,
    additional_details: "Missing one button on left sleeve"
  }
  
  fileIds = [
    "gid://shopify/File/111111",
    "gid://shopify/File/222222",
    "gid://shopify/File/333333",
    "gid://shopify/File/444444",
    "gid://shopify/File/555555"
  ]
  
  Step 1: Validate 3+ photos
  ──────────────────────────
    fileIds.length = 5 ✓
  
  Step 2: Create Shopify product
  ──────────────────────────────
    shopifyGraphQL.createProductWithMedia({
      title: "Maria B 3-piece",
      description: "",
      designer: "Maria B",
      item_type: "3-piece",
      size: "M",
      condition: "Like new",
      asking_price_usd: 85
    }, fileIds)
    
    GraphQL Mutation:
    {
      mutation createProduct($input: ProductInput!, $files: [FileInput!]!) {
        productCreate(input: $input) {
          product {
            id
            title
            productUrl: onlineStoreUrl
          }
        }
      }
    }
    
    Response:
    {
      productId: "gid://shopify/Product/987654321",
      productUrl: "https://thephirstory.myshopify.com/products/maria-b-3-piece"
    }
  
  Step 3: Save to database
  ────────────────────────
    INSERT INTO listings:
    {
      id: UUID,
      conversation_id: conv.id,
      seller_id: 42,
      status: "draft",
      designer: "Maria B",
      item_type: "3-piece",
      pieces_included: "3-piece",
      size: "M",
      condition: "Like new",
      asking_price_usd: 85,
      details: "Missing one button on left sleeve",
      shopify_product_id: "gid://shopify/Product/987654321",
      shopify_product_url: "https://thephirstory.myshopify.com/products/maria-b-3-piece",
      input_method: "whatsapp",
      created_at: NOW(),
      updated_at: NOW()
    }
    
    listing_id: "550e8400-e29b-41d4-a716-446655440000"
  
  Step 4: Reset conversation
  ──────────────────────────
    smsDb.resetConversation("+923001234567")
    
    UPDATE sms_conversations SET
      state: 'new',
      context: {},
      auth_attempts: 0
    WHERE phone = '+923001234567'
    
    Note: is_authorized, seller_id remain (user is still authorized for next SELL)
  
  Step 5: Send success message
  ────────────────────────────
    sendMessage("+923001234567",
      "✅ Success!\n\n" +
      "Your Maria B listing is now in review.\n\n" +
      "We'll notify you when it's approved.\n\n" +
      "Reply SELL to list another item."
    )

Return: { status: 'submitted', listing_id: "550e8400..." }
```

**WhatsApp Bot:**
```
✅ Success!

Your Maria B listing is now in review.

We'll notify you when it's approved.

Reply SELL to list another item.
```

**Database State After:**
```
sellers:
  id: 42
  phone: "+923001234567"
  email: "ak@gmail.com"
  is_active: true

sms_conversations:
  phone: "+923001234567"
  seller_id: 42
  is_authorized: true ← STAYS FOR NEXT SELL
  state: "new" ← RESET
  context: {} ← CLEARED

listings:
  id: "550e8400..."
  seller_id: 42
  shopify_product_id: "gid://shopify/Product/987654321"
  status: "draft"
```

---

## 🔄 Scenario 2: User Sends "SELL" Again (Fast Track)

```
User: "SELL" (2nd listing)

Webhook:
  conv = findOrCreateConversation("+923001234567")
  
  if (conv.is_authorized && conv.seller_id):
    ✓ User already authorized!
    
    → Clean up old flow (delete old Shopify files)
    → Reset context
    → Set state → 'awaiting_description'
    
    sendMessage("+923001234567",
      "Welcome back! ✓\n\n" +
      "Describe your item..."
    )

Result: Skips email + code verification, starts directly at description!
```

---

## ❌ Scenario 3: Wrong Code (3 Attempts)

```
User sends: "123456" (wrong code)

verifyAuthCode() returns false

attempts = incrementAuthAttempts("+923001234567")

Attempt 1: attempts = 1
  Response: "Invalid code. 2 attempts remaining."

Attempt 2: attempts = 2
  Response: "Invalid code. 1 attempt remaining."

Attempt 3: attempts = 3
  if (attempts >= 3):
    setState("+923001234567", "new") ← RESET STATE
    Response: "Too many failed attempts. Reply SELL to try again."

User must restart: SELL → Email → Code (fresh)
```

---

## 📸 Scenario 4: Only 2 Photos Sent

```
User sends: 2 photos, then "DONE"

photoCount = 2

if (photoCount < 3):
  Response: "Need at least 3 photos. You have 2. Send 1 more 📸"
  State: still "sell_photos"

User can:
  - Send 1 more photo
  - Text "CANCEL" to abort
  - Keep context and photos (until timeout)
```

---

## 🔄 Scenario 5: User Clicks "EDIT"

```
Summary shown:
  "Look good? [YES, SUBMIT] [EDIT] [CANCEL]"

User: clicks [EDIT]

showEditMenu() displays:
  "1️⃣ Designer: Maria B
   2️⃣ Pieces: 3-piece
   3️⃣ Size: M
   4️⃣ Condition: Like new
   5️⃣ Price: $85
   6️⃣ Notes: Missing one button
   
   Reply with number (1-6) or BACK"

User: "5"

→ Set editing_field = "asking_price_usd"
→ Set sub_state = "awaiting_edit_value"
→ Response: "Enter new Price:\n\nOptions: any number"

User: "95"

→ Validate price is valid number
→ Update listing_data.asking_price_usd = 95
→ Show edit menu again
→ User: "BACK"
→ showSummary() with NEW price ($95)
```

---

## 🕐 Scenario 6: Session Expires

```
User completes photos, gets summary, then waits 2 hours...

Conversation state still "sell_confirming"
Context still has all listing_data + fileIds

User: "Yes submit"

→ Webhook processes normally
→ Creates Shopify product
→ Saves to DB
→ Photos are still in fileIds

✓ Still works! No session timeout for now.

(Future: Add 24-hour expiry check)
```

---

## 📊 Complete Data Flow Diagram

```
WhatsApp User
     ↓
Twilio webhook POST /api/sms-webhook
     ↓
Parse message (text/image/button)
     ↓
Get or CREATE sms_conversations row
     ↓
Mark as processed (idempotency)
     ↓
STATE MACHINE ROUTER
     ├─ new/welcome → sendWelcome()
     ├─ awaiting_email → handleEmail()
     ├─ awaiting_code → handleCode()
     ├─ awaiting_description → handleDescription()
     ├─ sell_collecting → handleMissingField()
     ├─ sell_photos → handlePhoto() or handlePhotoState()
     ├─ awaiting_additional_details → handleAdditionalDetails()
     ├─ awaiting_additional_details_text → handleAdditionalDetailsText()
     ├─ sell_confirming → handleConfirmation()
     └─ sell_editing → handleEditing()
     ↓
Update sms_conversations + context
     ↓
Send response via Twilio WhatsApp API
     ↓
Return status 200 (always, even errors)
```

---

## 💾 Context Object Growth

```
Initial: {}

After email: {
  email: "ak@gmail.com",
  pending_seller_id: null
}

After description: {
  email: "ak@gmail.com",
  listing_data: {
    designer: "Maria B",
    pieces_included: "3-piece",
    size: "M",
    condition: "Like new",
    asking_price_usd: 85
  }
}

After photos: {
  email: "ak@gmail.com",
  listing_data: { ... },
  shopify_file_ids: [
    "gid://shopify/File/111111",
    "gid://shopify/File/222222",
    ...
  ]
}

After editing: {
  email: "ak@gmail.com",
  listing_data: { ... },
  shopify_file_ids: [ ... ],
  editing_field: "asking_price_usd",
  sub_state: "awaiting_edit_value"
}

After submission: {} (RESET)
```

---

## ⏱️ Timeline (Full Journey)

```
T0:00   User: "SELL"
        Bot: "What's your email?"

T0:15   User: "ak@gmail.com"
        Bot: "Check your email for code" + "Code: 467829" [SECURITY ISSUE]

T0:20   User: "467829"
        Bot: "Welcome! Describe your item..."

T0:35   User: [voice message 30 seconds]
        Bot: "Great! Send at least 3 photos..."

T2:00   User: [photo 1]
        Bot: "Got it! Keep sending..."

T2:15   User: [photo 2]
        Bot: (no response, listening)

T2:25   User: [photo 3]
        Bot: (no response)

T2:45   User: [photo 4]
T3:00   User: [photo 5]

T3:10   User: "DONE"
        Bot: "Got 5 photos! Any flaws? [NO, SKIP] [YES, ADD]"

T3:20   User: [YES, ADD]
        Bot: "What should buyers know?"

T3:25   User: "Missing one button on left sleeve"
        Bot: [Summary] "Look good? [YES, SUBMIT] [EDIT] [CANCEL]"

T3:30   User: [YES, SUBMIT]
        Bot: "✅ Success! Your listing is in review."
        
        Database: Product created + saved

TOTAL: 3 min 30 sec from "SELL" to successful submission
```

