# Photo Persistence Verification

## Code Flow Analysis ✅

I've traced the entire photo persistence flow through the codebase:

### 1. Photo Upload to Shopify
**File:** `api/sms-webhook.js:1000-1030`

```javascript
const photoRes = await fetch(`${API_BASE}/api/wa-product-image?action=add`, {
  method: 'POST',
  body: JSON.stringify({
    productId: latestSession.shopify_product_id,
    base64: base64,
    filename: `wa_${mediaId}.jpg`
  })
});

const photoData = await photoRes.json();
```

**Result:** Shopify returns CDN URL in `photoData.imageUrl`

---

### 2. URL Validation
**File:** `api/sms-webhook.js:1046-1058`

```javascript
// Strict validation: must have valid CDN URL
const hasValidUrl = photoData.imageUrl &&
                   typeof photoData.imageUrl === 'string' &&
                   photoData.imageUrl.length > 10 &&
                   (photoData.imageUrl.startsWith('http://') ||
                    photoData.imageUrl.startsWith('https://'));

if (!hasValidUrl) {
  console.error(`❌ Photo uploaded but no valid URL - skipping`);
  await sendMessage(phone, "That photo didn't upload—please resend it 📸");
  return res.status(200).json({ status: 'no url' });
}
```

**Result:** Only valid Shopify CDN URLs proceed

---

### 3. Save to Supabase Session
**File:** `api/sms-webhook.js:1061-1067`

```javascript
// Save only the URL (not base64) - Shopify is our CDN now
latestSession.photos.push({
  imageUrl: photoData.imageUrl,  // Shopify CDN URL
  imageId: photoData.imageId,     // Shopify image ID
  mediaId: mediaId                 // WhatsApp media ID (for deduplication)
});

await saveSession(phone, latestSession);
```

**Result:** Photo object with Shopify CDN URL saved to `whatsapp_sessions.session.photos[]`

---

### 4. Extract URLs at Submit Time
**File:** `api/sms-webhook.js:1111-1113`

```javascript
// Extract photo URLs (photos already uploaded to Shopify)
const photoUrls = (session.photos || [])
  .map(p => p.imageUrl)
  .filter(url => url); // Filter out any nulls
```

**Result:** Array of Shopify CDN URLs extracted from session

---

### 5. Save to Listings Database
**File:** `api/sms-webhook.js:1179`

```javascript
photo_urls: photoUrls.length > 0 ? photoUrls : null,
```

**Result:** URLs saved to `listings.photo_urls` column (JSONB array)

---

## Verification Checklist

### ✅ Code Verification (Complete)
- [x] Photo upload to Shopify via `wa-product-image` API
- [x] CDN URL returned from Shopify
- [x] URL validation (string, > 10 chars, starts with http)
- [x] URL saved to Supabase session (`whatsapp_sessions.session.photos[]`)
- [x] Session persisted via `saveSession()`
- [x] URLs extracted at submit time
- [x] URLs saved to `listings.photo_urls` column
- [x] No base64 stored anywhere (Shopify is CDN)

### 🔍 Production Testing Needed
To verify this works in production with real WhatsApp messages:

1. **Send listing via WhatsApp**
   - Complete sell flow
   - Upload 3 photos
   - Submit listing

2. **Check Vercel logs**
   - Look for: `✅ Photo X uploaded to Shopify: https://cdn.shopify.com/...`
   - Look for: `📸 Photos already in Shopify: 3 valid URLs`
   - Look for: `✅ Listing submitted: ${listingId}`

3. **Check Supabase**
   ```sql
   SELECT
     id,
     email,
     phone,
     designer,
     photo_urls,
     shopify_product_id,
     created_at
   FROM listings
   WHERE phone = '+15551234567'  -- your test phone
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   **Expected:**
   - `photo_urls` should be JSONB array: `["https://cdn.shopify.com/...", "https://cdn.shopify.com/...", "https://cdn.shopify.com/..."]`
   - Should have 3 URLs
   - All URLs should start with `https://cdn.shopify.com/`
   - `shopify_product_id` should be populated

4. **Check Shopify Admin**
   - Go to: `https://ba42c1.myshopify.com/admin/products/{productId}`
   - Verify all 3 photos are visible
   - Verify product is in "Draft" status

---

## Expected Photo Journey

```
┌─────────────────┐
│  WhatsApp User  │
│  Sends Photo    │
└────────┬────────┘
         │
         v
┌─────────────────────────────────────┐
│  sms-webhook.js                     │
│  - Downloads from WhatsApp          │
│  - Compresses with Sharp            │
│  - Converts to base64               │
└────────┬────────────────────────────┘
         │
         v
┌─────────────────────────────────────┐
│  wa-product-image.js                │
│  - Uploads to Shopify               │
│  - Polls for CDN URL                │
│  - Returns imageUrl + imageId       │
└────────┬────────────────────────────┘
         │
         v
┌─────────────────────────────────────┐
│  sms-webhook.js                     │
│  - Validates URL                    │
│  - Saves to session.photos[]        │
│  - Persists to Supabase             │
└────────┬────────────────────────────┘
         │
         │  (User texts "DONE")
         v
┌─────────────────────────────────────┐
│  submitListing()                    │
│  - Extracts photo_urls from session │
│  - Saves to listings table          │
│  - Sends success message            │
└────────┬────────────────────────────┘
         │
         v
┌─────────────────────────────────────┐
│  Database: listings                 │
│  {                                  │
│    photo_urls: [                    │
│      "https://cdn.shopify.com/...", │
│      "https://cdn.shopify.com/...", │
│      "https://cdn.shopify.com/..."  │
│    ],                               │
│    shopify_product_id: "123456"    │
│  }                                  │
└─────────────────────────────────────┘
```

---

## Key Points

1. **No base64 in database** ✅
   - Base64 only exists transiently during upload
   - Never stored in Supabase
   - Shopify is the CDN

2. **URLs persist correctly** ✅
   - Saved to session during upload
   - Extracted and saved to listings at submit time
   - Both use the same format: `{ imageUrl, imageId, mediaId }`

3. **Validation prevents phantom photos** ✅
   - Only valid CDN URLs are saved
   - Filter out nulls at every step
   - User gets error message if upload fails

4. **Race conditions handled** ✅
   - Re-fetch session before state checks
   - Small random delay prevents concurrent overwrites
   - Deduplication via mediaId

---

## Next Steps

1. **Test in production via WhatsApp**
2. **Check Vercel logs for photo upload confirmations**
3. **Query Supabase to verify photo_urls array**
4. **Verify photos visible in Shopify admin**

If any step fails, the logs will show:
- `❌ Photo uploaded but no valid URL` → Shopify not returning URL
- `❌ Not enough photos: X/3` → URLs not persisting to session
- `📸 Photos already in Shopify: 0 valid URLs` → Session not saving correctly
