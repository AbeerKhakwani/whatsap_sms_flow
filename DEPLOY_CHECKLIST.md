# WhatsApp Images Fix - Deploy Checklist

## ✅ Completed

### Code Changes
- [x] Created `/api/wa-product-image.js` with base64 normalization
- [x] Added server-side image compression with `sharp`
- [x] Updated WhatsApp webhook to use new endpoint
- [x] Added `stripDataUriPrefix()` for base64 normalization
- [x] Added `normalizeShopifyProductId()` for GID handling
- [x] Added robust URL extraction (6 fallback fields)
- [x] Added health check endpoint (GET `/api/wa-product-image`)
- [x] Installed `sharp` dependency
- [x] Build succeeds ✅

### Dashboard Safety
- [x] Dashboard uses separate endpoint (`/api/product-image`)
- [x] No changes to dashboard code
- [x] No changes to `lib/shopify.js`
- [x] Zero risk of regression

## 📋 Pre-Deploy Testing (Local)

Run these before deploying:

```bash
# 1. Verify build
npm run build

# 2. Test health endpoint (after local dev server)
curl http://localhost:5173/api/wa-product-image
# Expected: { "ok": true, "route": "wa-product-image" }

# 3. Check for TypeScript/lint errors
npm run lint  # if you have linting setup
```

## 🚀 Deploy Steps

1. **Commit changes**:
   ```bash
   git add .
   git commit -m "fix: WhatsApp image uploads with compression and base64 normalization"
   git push origin main
   ```

2. **Deploy to Vercel**:
   - Vercel will auto-deploy from main branch
   - Or use: `vercel --prod`

3. **Verify deployment**:
   - Check Vercel dashboard for successful build
   - No build errors

## 🧪 Post-Deploy Testing (Production)

### 1. Health Check
```bash
curl https://sell.thephirstory.com/api/wa-product-image
```
**Expected**: `{ "ok": true, "route": "wa-product-image" }`

### 2. WhatsApp Image Upload Test
**Steps**:
1. Send "SELL" to WhatsApp bot
2. Complete email + description flow
3. Fill in all required fields (designer, size, condition, price)
4. Skip additional details (or add some)
5. Send **3 photos** (include at least one large iPhone photo)
6. Reply "SUBMIT"

**Expected Results**:
- ✅ Bot responds: "Got 1/3 photos", "Got 2/3", "Perfect! Got 3 photos"
- ✅ Bot shows submit button
- ✅ Submission succeeds: "🎉 Submitted!"
- ✅ No error message

### 3. Verify in Shopify Admin
1. Go to Shopify Admin → Products → Drafts
2. Find the newly created draft (search by designer name)
3. **Check images**: Should show all 3 photos
4. Click into product details
5. Verify all images are visible and not broken

### 4. Verify in Database
```sql
-- Check listings table has photo_urls populated
SELECT id, designer, photo_urls
FROM listings
ORDER BY created_at DESC
LIMIT 1;
```
**Expected**: `photo_urls` should be an array of 3 URLs (not null)

### 5. Dashboard Regression Test
**Steps**:
1. Go to `/submit` page
2. Fill in listing form
3. Upload 3 photos via web form
4. Click "Submit Listing"

**Expected**:
- ✅ Listing created successfully
- ✅ Photos upload (same as before)
- ✅ No errors

## 🔍 Monitoring

### Watch Vercel Logs
1. Go to Vercel dashboard → Logs
2. Filter by "wa-product-image"
3. Look for these log patterns:

**Successful upload:**
```
📸 WA Image Upload: original=123, normalized=123, filename=photo_1.jpg, base64Length=523412
📸 Base64 format: raw base64 → kept as-is
📸 Compressed: 5242880 bytes → 524288 bytes (10%)
✅ WA Image uploaded: imageId=123456, imageUrl=https://cdn.shopify.com/...
```

**Potential issues:**
```
❌ Missing required fields
❌ WA Image upload error
⚠️  Image uploaded but no URL returned
```

### Common Issues & Fixes

#### Issue: "Image uploaded but no URL returned"
**Diagnosis**: Shopify response format unexpected
**Fix**: Check Vercel logs for "Full image object" to see what fields Shopify returned
**Action**: Add that field to URL extraction fallback

#### Issue: Timeout during upload
**Diagnosis**: Image too large even after compression
**Fix**: Reduce `width` in `bufferToOptimizedJpegBase64()` from 1600 to 1200

#### Issue: "Invalid image" error
**Diagnosis**: Base64 format issue
**Fix**: Check logs for "Base64 format" - should show "raw base64"

## 📊 Success Metrics

After 10 WhatsApp submissions with photos:
- ✅ 90%+ success rate (9/10 submissions succeed)
- ✅ All photos appear in Shopify
- ✅ No timeouts
- ✅ Dashboard still works (0 regressions)

## 🔄 Rollback Plan (If Needed)

If critical issues occur:

```bash
# 1. Revert webhook endpoint
# In api/sms-webhook.js, change:
/api/wa-product-image?action=add
# back to:
/api/product-image?action=add

# 2. Commit and push
git add api/sms-webhook.js
git commit -m "rollback: use original image endpoint"
git push origin main

# 3. Vercel will auto-deploy rollback
```

Dashboard will continue working because it never used the new endpoint.

## 📝 Notes

- **Dashboard unaffected**: Uses `/api/product-image` (original endpoint)
- **WhatsApp only**: Uses `/api/wa-product-image` (new endpoint)
- **Compression**: Only applied to WhatsApp photos (not dashboard)
- **Zero breaking changes**: All changes are additive

---

## ✅ Ready to Deploy?

Check all boxes above, then:
```bash
git add .
git commit -m "fix: WhatsApp image uploads with compression and normalization"
git push origin main
```

Then monitor Vercel logs during first few WhatsApp submissions! 🚀
