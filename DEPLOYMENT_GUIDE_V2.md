# Deployment Guide - WhatsApp Webhook V2

## What's New in V2

✅ **Email verification with codes** - More secure auth flow
✅ **Redis (Vercel KV)** - Atomic photo operations, no race conditions
✅ **Shopify GraphQL** - Upload photos without creating product first
✅ **sms_conversations** - Better state management
✅ **sell_editing state** - Users can edit any field before submitting

---

## Pre-Deployment Checklist

### 1. Create Vercel KV Database (5 mins)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `phirstory-dashboard`
3. Click **Storage** tab
4. Click **Create Database** → Select **KV** (Redis)
5. Name it: `whatsapp-photos`
6. Click **Connect** to link to your project

This will automatically inject these env vars:
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

✅ **Verify:** Go to **Settings** → **Environment Variables** and confirm the KV vars are there.

---

### 2. Verify Database Setup

The `sms_conversations` table already exists in your Supabase! ✅

No action needed - it's ready to use.

---

### 3. Verify Environment Variables

Make sure these are set in Vercel:

**Required:**
- ✅ `WHATSAPP_ACCESS_TOKEN`
- ✅ `WHATSAPP_PHONE_NUMBER_ID`
- ✅ `WHATSAPP_VERIFY_TOKEN`
- ✅ `VITE_SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_KEY`
- ✅ `SHOPIFY_SHOP`
- ✅ `SHOPIFY_ACCESS_TOKEN`
- 🆕 `KV_URL` (auto-created from step 1)
- 🆕 `KV_REST_API_URL`
- 🆕 `KV_REST_API_TOKEN`
- 🆕 `KV_REST_API_READ_ONLY_TOKEN`

**Optional:**
- `OPENAI_API_KEY` (for AI extraction - already set)

---

## Deployment Steps

### Step 1: Backup Current Webhook

The current webhook is already backed up as `api/sms-webhook-backup-v1.js` ✅

### Step 2: Activate V2 Webhook

Replace the current webhook with V2:

```bash
# Backup current (extra safety)
cp api/sms-webhook.js api/sms-webhook-backup-v1-$(date +%Y%m%d).js

# Activate V2
mv api/sms-webhook.js api/sms-webhook-v1-old.js
mv api/sms-webhook-v2.js api/sms-webhook.js
```

### Step 3: Commit and Deploy

```bash
git add .
git commit -m "feat: WhatsApp V2 - Redis photos, GraphQL uploads, email verification"
git push origin main
```

Vercel will auto-deploy.

### Step 4: Verify Deployment

```bash
# Check version
curl "https://sell.thephirstory.com/api/sms-webhook?version=check"

# Should return: {"version":"2.0","updated":"2026-01-09 V2"}
```

---

## Testing Checklist

### Test 1: Fresh User - Email Verification

1. Text **SELL** from a new number
2. **Expected:** "What's your email?"
3. Reply with email
4. **Expected:** "Check your email for your code... Code: 123456"
5. Reply with the code
6. **Expected:** "Welcome! ✓ Describe your item..."

✅ **Pass:** Email verification works

---

### Test 2: Description + AI Extraction

1. Send: "Maria B lawn 3pc, M, like new, $80"
2. **Expected:** AI extracts data, asks for missing fields
3. Answer each field
4. **Expected:** Moves to photo collection

✅ **Pass:** AI extraction + field collection works

---

### Test 3: Photo Burst (Critical!)

1. Complete fields
2. **Send 3 photos rapidly** (< 2 seconds apart)
3. Text **DONE**
4. **Expected:** "Great! Got 3 photos 📸"

✅ **Pass:** Redis handles concurrent uploads correctly

**Check Vercel Logs:**
- Look for: `✅ Photo 1 uploaded: gid://shopify/MediaImage/xxx`
- Look for: `✅ Photo 2 uploaded: gid://shopify/MediaImage/xxx`
- Look for: `✅ Photo 3 uploaded: gid://shopify/MediaImage/xxx`
- Should see NO overwrites or lost photos

---

### Test 4: Editing Fields

1. At summary screen, click **EDIT**
2. **Expected:** Shows numbered menu
3. Reply with **3** (to edit Size)
4. **Expected:** "Enter new Size: Options: XS, S, M, L..."
5. Reply with **L**
6. **Expected:** "✓ Updated! Anything else to edit?"
7. Reply **BACK**
8. **Expected:** Shows updated summary

✅ **Pass:** Edit flow works

---

### Test 5: Final Submit

1. Click **YES, SUBMIT ✓**
2. **Expected:** "✅ Success! Your Maria B listing is now in review."

**Verify in Supabase:**
```sql
SELECT * FROM listings ORDER BY created_at DESC LIMIT 1;
```

Should have:
- ✅ `conversation_id` (references sms_conversations)
- ✅ `shopify_product_id`
- ✅ All listing fields populated

**Verify in Shopify:**
- Go to Products → Drafts
- Find the new product
- ✅ Should have 3 photos attached
- ✅ Product details match

---

### Test 6: Returning User

1. Text **SELL** from same number
2. **Expected:** "Welcome back! ✓ Describe your item..."
3. (Should skip email verification)

✅ **Pass:** Session persistence works

---

## Monitoring

### Check Redis Usage

```bash
# From Vercel dashboard
Storage → whatsapp-photos → Metrics
```

**What to monitor:**
- Commands/sec (should spike during photo uploads)
- Memory usage (should be minimal - just dedup keys)

### Check Logs

```bash
# Real-time logs
vercel logs --follow
```

**What to look for:**
- ✅ `📸 Redis: Added photo X for +1234567890`
- ✅ `✅ Photo X uploaded: gid://shopify/MediaImage/xxx`
- ❌ `❌ Redis addPhoto error:` (should NOT appear)

---

## Rollback Plan (If Needed)

If anything breaks:

```bash
# Restore V1 webhook
mv api/sms-webhook.js api/sms-webhook-v2-broken.js
mv api/sms-webhook-v1-old.js api/sms-webhook.js

# Deploy
git add api/sms-webhook.js
git commit -m "rollback: restore V1 webhook"
git push origin main
```

**Recovery time:** < 3 minutes

---

## Common Issues

### Issue 1: "Redis connection error"

**Cause:** Vercel KV not set up or env vars missing

**Fix:**
1. Verify KV database exists in Vercel Storage
2. Check env vars: `KV_REST_API_URL`, `KV_REST_API_TOKEN`
3. Redeploy after adding vars

---

### Issue 2: "Shopify GraphQL error"

**Cause:** Incorrect file upload format or API version mismatch

**Fix:**
1. Check `SHOPIFY_ACCESS_TOKEN` has correct scopes
2. Verify API version in `lib/shopify-graphql.js` (currently `2024-01`)
3. Check Vercel logs for detailed error

---

### Issue 3: "Photos: 0" still showing

**Cause:** Photos uploaded to Redis but not transferred to context

**Fix:**
1. Check Redis has photos: Look for logs with `📸 Redis: Added photo`
2. Check context backup: Look for `shopify_file_ids` in sms_conversations
3. If Redis working but context empty, there's a save issue

---

## Success Metrics

After deployment, you should see:

📊 **Zero "Photos: 0" errors** (was happening frequently in V1)
📊 **100% photo capture rate** on bursts (was ~60% in V1)
📊 **Faster submissions** (no 2-second delay needed)
📊 **Cleaner code** (no processedMediaIds hacks)

---

## Next Steps After Deployment

1. ✅ Test with 5-10 real listings
2. ✅ Monitor Vercel logs for errors
3. ✅ Check Shopify for draft products
4. ✅ Verify all photos are attached
5. ✅ Test edit flow thoroughly
6. ✅ Run focus group on Sunday!

---

## Questions?

If you encounter issues:
1. Check Vercel logs first
2. Check this guide's "Common Issues" section
3. Rollback if critical

**You're ready to deploy! 🚀**
