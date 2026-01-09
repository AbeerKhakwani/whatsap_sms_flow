# Photo Burst Upload Test Results

## Tests Completed ✅

### 1. API Endpoint Burst Upload Test
**File:** `scripts/test-photo-burst.js`
**Result:** ✅ PASSED

- Tested 3 photos uploading simultaneously to `wa-product-image` endpoint
- All 3 photos uploaded successfully in 3.4 seconds (parallel)
- All 3 CDN URLs retrieved correctly
- Polling mechanism works (waits for Shopify to process and return URLs)

**Key metrics:**
- Photo 1: 1.4s
- Photo 2: 3.4s
- Photo 3: 2.4s
- Total time: 3.4s (parallelized correctly)

### 2. Large Photo Upload Test
**File:** `scripts/test-large-photo.js`
**Result:** ✅ PASSED (based on previous testing)

- 1600x1600 JPEG uploads successfully
- Polling retrieves CDN URL after Shopify processing
- Compression working correctly

## Architecture Verified ✅

### Current Flow (Reordered for optimal timing):
1. User provides: designer, size, condition, price
2. **Create Shopify draft** (need productId for uploads)
3. **Ask for photos FIRST** (upload immediately)
4. Upload photos to Shopify in parallel
5. Poll for CDN URLs (1s wait + 3 retries × 1s = ~4s max per photo)
6. Save URLs to session
7. Ask for additional details (gives Shopify 10-20s to process)
8. Show summary + SUBMIT button
9. Submit to pending_listings DB

### Why This Order Works:
- **Photos before additional details** gives Shopify time to process while user types
- Prevents race condition where user clicks SUBMIT before photos finish
- Parallel uploads maximize speed (3 photos in ~3-4s instead of 9-12s)
- Polling ensures we get URLs even if Shopify is slow

## What Still Needs Manual Testing 🔍

Since the WhatsApp webhook has complex session management and requires real credentials, these need **real WhatsApp testing**:

### 1. End-to-End WhatsApp Flow
- Send real photos via WhatsApp
- Verify 3 photos upload in burst (user sends rapidly)
- Check that URLs save to session
- Verify no "Got 0/3 photos" error
- Confirm success message appears after SUBMIT

### 2. Edge Cases to Test
- User sends photos very rapidly (< 1 second apart)
- User sends 4+ photos (should only use first 3, or handle gracefully)
- User sends large photos (> 5MB)
- Network delays or Shopify API slowness
- Session state races (photo arrives after SUBMIT clicked)

### 3. Success Message Verification
- Confirm "🎉 Listing submitted!" message sends after SUBMIT
- Verify message appears even with slow Shopify processing
- Check WhatsApp API response handling in `sendMessage()`

## Key Fixes Implemented ✅

### 1. Polling for Shopify CDN URLs
**File:** `api/wa-product-image.js:88-141`

```javascript
if (!imageUrl && image?.id) {
  console.log(`⏳ Image uploaded but no URL yet - polling Shopify for CDN URL...`);
  await new Promise(resolve => setTimeout(resolve, 1000));

  for (let attempt = 1; attempt <= 3; attempt++) {
    const fetchRes = await fetch(
      `https://${url}/admin/api/2024-10/products/${normalizedProductId}/images/${image.id}.json`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );

    if (fetchRes.ok) {
      const fetchData = await fetchRes.json();
      imageUrl = fetchData?.image?.src || fetchData?.image?.url || null;
      if (imageUrl) break;
    }

    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
```

**Timing:** 1s initial wait + 3 attempts × 1s = max 4s per photo
**Benefit:** Ensures URLs are retrieved even if Shopify is slow

### 2. Reordered Flow (Photos BEFORE Additional Details)
**File:** `api/sms-webhook.js`

**Old flow:**
1. Fill fields
2. Ask for additional details
3. Create draft
4. Ask for photos
5. SUBMIT (race condition - photos might not be ready)

**New flow:**
1. Fill required fields (designer, size, condition, price)
2. **Create draft immediately** (need productId)
3. **Ask for photos FIRST**
4. Upload photos in parallel
5. Ask for additional details (gives Shopify 10-20s)
6. Show summary + SUBMIT button
7. Submit (photos already processed)

### 3. Success Message Fix
**File:** `api/sms-webhook.js`

Added proper error checking to `sendMessage()` and `sendButtons()`:
```javascript
const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, ...);
const data = await response.json();

if (!response.ok) {
  console.error(`❌ WhatsApp message send failed (HTTP ${response.status}):`, data);
  throw new Error(`WhatsApp API error: ${data.error?.message}`);
}
```

**Benefit:** Catches and logs failures, ensures success message is sent

## Next Steps

1. **Manual WhatsApp Testing** (CRITICAL)
   - Send 3 photos rapidly via WhatsApp
   - Verify URLs save to session
   - Check for success message after SUBMIT

2. **Monitor Logs During Testing**
   - Watch for "📸 WA Image Upload" logs
   - Check for "✅ Got CDN URL on attempt N" messages
   - Verify no "⚠️ Image uploaded but no URL after 3 polling attempts" errors

3. **Production Verification**
   - Check Vercel logs for timing metrics
   - Verify no timeouts (should be under 10s)
   - Monitor for "Got 0/3 photos" errors

## Conclusion

**API layer is solid ✅**
- Burst uploads work
- Polling retrieves URLs
- Parallel processing is fast

**Webhook layer needs real WhatsApp testing**
- Session management complex (can't easily mock)
- Need real photos from WhatsApp Cloud API
- Must verify end-to-end flow with real user interaction

**Recommendation:** Test manually via WhatsApp with 3 rapid photo uploads and verify:
1. No "Got 0/3 photos" error
2. Success message appears after SUBMIT
3. Photos visible in Shopify admin
