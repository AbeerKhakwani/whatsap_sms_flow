# Verify Photos Upload to Shopify - Sunday Pre-Check

## Quick Photo Verification (5 minutes)

### Step 1: Check Vercel Logs for Photo Upload

```bash
vercel logs --since=30m | grep "📸"
```

**Look for**:
```
📸 Shopify upload: productId=123... filename=photo_1.jpg, base64 length=50000
📸 Shopify response: status=201 Created
✅ Shopify image uploaded: id=456... src=https://cdn.shopify.com/...
```

**Red flags**:
```
❌ Shopify image upload failed: ...
📸 Shopify response: status=400 Bad Request
```

---

### Step 2: Check Shopify Admin

1. Go to: https://ba42c1.myshopify.com/admin/products
2. Find recent draft product (sort by "Updated" desc)
3. Click on product
4. Scroll to "Media" section

**✅ Expected**: 3 images shown with thumbnails
**❌ Problem**: "Photos (0)" or empty

---

### Step 3: Test Photo Upload Directly

Use curl to test `/api/product-image` endpoint:

```bash
# 1. Create a test draft first (or use existing product ID)
PRODUCT_ID="9876543210"

# 2. Create tiny test image (1x1 red pixel PNG)
BASE64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

# 3. Upload to Shopify
curl -X POST "https://sell.thephirstory.com/api/product-image?action=add" \
  -H "Content-Type: application/json" \
  -d "{
    \"productId\": \"$PRODUCT_ID\",
    \"base64\": \"$BASE64\",
    \"filename\": \"test.jpg\"
  }"
```

**✅ Expected response**:
```json
{
  "success": true,
  "imageId": 123456789,
  "imageUrl": "https://cdn.shopify.com/s/files/..."
}
```

**❌ Error response**:
```json
{
  "error": "Failed to process image",
  "details": "..."
}
```

---

### Step 4: End-to-End Test with Real WhatsApp

**Prerequisites**:
- WhatsApp Business account configured
- Webhook pointing to sell.thephirstory.com
- Phone number registered

**Test flow**:
1. Text: `SELL` to your WhatsApp number
2. Enter existing email (or create new account)
3. Send description: "Maria B lawn 3pc M like new $80"
4. Answer missing field questions
5. Send 3 photos (front, back, tag)
6. Tap SUBMIT ✓

**Verify**:
1. Check Vercel logs: `vercel logs --since=5m | grep "📸"`
2. Check Shopify admin for new draft
3. Confirm 3 photos appear in Media section

---

## Common Issues & Fixes

### Issue: Photos show 0 in Shopify but logs say success

**Possible causes**:
1. Base64 encoding issue (missing data:image prefix or corrupted)
2. Shopify API quota exceeded
3. Wrong product ID

**Fix**:
```javascript
// Check base64 format in lib/shopify.js addProductImage:
console.log(`Base64 preview: ${base64.substring(0, 50)}...`);

// Should NOT have "data:image/jpeg;base64," prefix
// Should be raw base64 string
```

---

### Issue: Shopify returns 400 Bad Request

**Possible causes**:
1. Base64 too large (>20MB limit)
2. Invalid product ID
3. Missing Shopify access token

**Fix**:
1. Check base64 size:
```javascript
const sizeInMB = (base64.length * 0.75) / (1024 * 1024);
console.log(`Photo size: ${sizeInMB.toFixed(2)} MB`);
```

2. Verify env vars:
```bash
node scripts/check-env.js
```

---

### Issue: Photos uploaded but URL not returned

**Possible cause**: `api/product-image.js` not returning `imageUrl`

**Fix** (already applied):
```javascript
// api/product-image.js should return:
return res.status(200).json({
  success: true,
  imageId: image?.id,
  imageUrl: image?.src  // ← Must include this
});
```

---

## Production Verification Checklist

Before Sunday demo:

- [ ] Run `node scripts/check-env.js` - all required vars set
- [ ] Test photo upload with curl - returns imageUrl
- [ ] Check Shopify admin - photos visible in draft
- [ ] End-to-end WhatsApp test - full flow works
- [ ] Check `vercel logs` - no photo upload errors
- [ ] Verify `photo_urls` in Supabase listings table

---

## Debug Commands

**Check recent Shopify uploads**:
```bash
vercel logs --since=1h | grep "Shopify upload\|Shopify response\|image uploaded"
```

**Check photo URLs saved to DB**:
```sql
SELECT id, designer, photo_urls, created_at
FROM listings
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC
LIMIT 10;
```

**Test Shopify connection**:
```bash
curl -X GET "https://ba42c1.myshopify.com/admin/api/2024-10/products/count.json" \
  -H "X-Shopify-Access-Token: YOUR_TOKEN"
```

**Expected**: `{"count": 123}`

---

## If Photos Still Not Working

### Quick Fix for Sunday Demo:

1. **Option A**: Use TEST_MODE to show flow works
   - Set `TEST_MODE=true` in Vercel env
   - Photos won't actually upload but flow completes
   - Good for demonstrating UX

2. **Option B**: Manual photo upload
   - Complete submission without photos
   - Admin manually adds photos in Shopify
   - Not ideal but functional

3. **Option C**: Skip photo requirement temporarily
   - Change `if (photoCount >= 3)` to `if (photoCount >= 0)`
   - Allow submission without photos
   - Add photos as "optional" feature

---

## Photo Upload Code Path

```
WhatsApp message (type=image)
  ↓
api/sms-webhook.js handlePhoto()
  ↓
getMediaUrl(mediaId) → downloads from Meta
  ↓
Saves base64 to session.photos[]
  ↓
User taps SUBMIT
  ↓
submitListing() loops through session.photos
  ↓
Calls /api/product-image?action=add for each photo
  ↓
api/product-image.js
  ↓
lib/shopify.js addProductImage()
  ↓
POST to Shopify /products/{id}/images.json
  ↓
Returns { imageId, imageUrl }
  ↓
Saved to listings.photo_urls[] in DB
```

---

## Success Metrics

✅ **Photo upload working if**:
- Vercel logs show "✅ Shopify image uploaded"
- Shopify admin shows 3 thumbnails in Media section
- `listings.photo_urls` array has 3 CDN URLs
- No 400/500 errors in logs

❌ **Photo upload broken if**:
- Logs show "❌ Shopify image upload failed"
- Shopify shows "Photos (0)"
- `listings.photo_urls` is null or empty
- 400 Bad Request errors

---

## Emergency Contact (If Stuck)

Check:
1. Shopify API status: https://status.shopify.com
2. Vercel status: https://vercel.com/status
3. WhatsApp Cloud API status: https://status.fb.com

If all else fails:
- Demo flow WITHOUT photos (focus on conversational UX)
- Explain "photos coming soon" to focus group
- Collect feedback on rest of experience

---

**Good luck! Photos should be working with all the fixes applied.** 🚀
