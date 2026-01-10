# WhatsApp Photo Burst Fix - Implementation Plan
**Target: Complete before Sunday Focus Group**
**Time Budget: 2 hours**
**Risk Level: LOW (can rollback easily)**

---

## Current Status ✅

### What's Working (DO NOT TOUCH):
- ✅ Conversation flow (questions, buttons, messages)
- ✅ Auth logic (matches all your requirements already)
- ✅ AI extraction
- ✅ State machine structure
- ✅ Shopify draft creation
- ✅ Database schema

### What's Broken (MUST FIX):
- ❌ Photo burst race condition (3 photos sent rapidly → only 1-2 save)
- ❌ Summary shows wrong photo count
- ❌ 2-second delay after DONE (band-aid, not real fix)

---

## Problem Analysis

### Root Cause: Concurrent Webhook Overwrites

```
Time: 6:07:00 PM
User sends 3 photos in 2 seconds

Webhook 1 (Photo 1)          Webhook 2 (Photo 2)          Webhook 3 (Photo 3)
├─ Read session              ├─ Read session              ├─ Read session
│  photos: []                │  photos: []                │  photos: []
├─ Upload to Shopify (3s)    ├─ Upload to Shopify (3s)    ├─ Upload to Shopify (3s)
├─ Get URL: "url1"           ├─ Get URL: "url2"           ├─ Get URL: "url3"
├─ session.photos = ["url1"] ├─ session.photos = ["url2"] ├─ session.photos = ["url3"]
└─ Save session (OVERWRITES) └─ Save session (OVERWRITES) └─ Save session (OVERWRITES)

Result: Last one wins → session.photos = ["url3"] only
Lost: url1, url2 ❌
```

**Why This Happens:**
1. Vercel serverless = stateless (no shared memory)
2. 3 webhooks run in parallel on different containers
3. All read old state simultaneously
4. All write back, last write wins
5. Supabase session table has no atomic list operations

---

## Solution: Redis (Vercel KV)

### Why Redis Solves This:

**Redis = Single-threaded with atomic operations**

```
Webhook 1                    Webhook 2                    Webhook 3
├─ SETNX photo:phone:media1  ├─ SETNX photo:phone:media2  ├─ SETNX photo:phone:media3
│  → Returns 1 (claimed!)    │  → Returns 1 (claimed!)    │  → Returns 1 (claimed!)
├─ Upload to Shopify         ├─ Upload to Shopify         ├─ Upload to Shopify
├─ RPUSH photos:phone "url1" ├─ RPUSH photos:phone "url2" ├─ RPUSH photos:phone "url3"
└─ LLEN → 1                  └─ LLEN → 2                  └─ LLEN → 3

Redis internally queues RPUSH operations → no race condition!
Result: All 3 photos saved ✅
```

### Redis Operations Used:

1. **SETNX** (Set if Not Exists)
   - Atomic deduplication
   - Prevents WhatsApp duplicate webhooks
   - Returns 1 if new, 0 if exists

2. **RPUSH** (Right Push to List)
   - Atomic list append
   - Thread-safe (Redis is single-threaded)
   - No overwrites

3. **LLEN** (List Length)
   - Instant count (O(1))
   - No need to fetch entire array

4. **LRANGE** (List Range)
   - Get all items when needed
   - Transfer to Supabase on DONE

5. **EXPIRE** (Set TTL)
   - Auto-cleanup after 1 hour
   - No manual maintenance

---

## Implementation Plan

### Phase 1: Setup (15 mins)

#### Step 1.1: Create Vercel KV Database (5 mins - YOU)
1. Go to Vercel dashboard
2. Your project → **Storage** tab
3. Click **Create Database** → Select **KV**
4. Name: `whatsapp-photos-dedup`
5. Click **Connect** to link to project
6. Vercel auto-injects env vars:
   - `KV_URL`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`

#### Step 1.2: Install Package (2 mins - ME)
```bash
npm install @vercel/kv
```

#### Step 1.3: Create Redis Helper Module (8 mins - ME)
File: `lib/redis-photos.js`

Functions:
- `claimPhoto(phone, mediaId)` → Deduplication
- `addPhoto(phone, photoUrl, mediaId)` → Atomic add
- `getPhotoCount(phone)` → Instant count
- `getPhotos(phone)` → Get all URLs
- `clearPhotos(phone)` → Cleanup after submit

---

### Phase 2: Update Photo Handler (30 mins)

#### Changes to `api/sms-webhook.js`:

**Current Flow:**
```javascript
async function handlePhoto(phone, mediaId, session, res) {
  // Check processedMediaIds in session
  if (session.processedMediaIds.includes(mediaId)) return;

  // Upload to Shopify
  const photoUrl = await uploadToShopify(mediaId);

  // Add to session
  session.photos.push(photoUrl);
  session.processedMediaIds.push(mediaId);

  // Save session (RACE CONDITION HERE!)
  await saveSession(phone, session);
}
```

**New Flow (Redis):**
```javascript
async function handlePhoto(phone, mediaId, session, res) {
  // 1. Atomic dedup check (Redis)
  const claimed = await claimPhoto(phone, mediaId);
  if (!claimed) {
    console.log('Duplicate or already processing');
    return res.status(200).json({ status: 'duplicate' });
  }

  // 2. Upload to Shopify (same as before)
  const photoUrl = await uploadToShopify(mediaId);

  // 3. Atomic add to Redis list (NO RACE CONDITION!)
  const count = await addPhoto(phone, photoUrl, mediaId);

  console.log(`Photo ${count} saved to Redis: ${photoUrl}`);

  // 4. Send confirmation on first photo only
  if (count === 1) {
    await sendMessage(phone, "Got it! 📸\n\nKeep sending. Text DONE when finished.");
  }

  return res.status(200).json({ status: 'success', count });
}
```

**Key Changes:**
- ✅ No Supabase session read/write during photo upload
- ✅ Atomic operations via Redis
- ✅ Remove `processedMediaIds` from session (Redis handles it)
- ✅ Remove 2-second delay (not needed anymore)

---

### Phase 3: Update DONE Handler (15 mins)

**Current Flow:**
```javascript
async function handlePhotoState(phone, text, buttonId, session, res) {
  if (userText === 'done') {
    // Wait 2 seconds (HACK!)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Re-fetch session
    const freshSession = await getSession(phone);
    const photoCount = freshSession.photos.length;

    // Show summary...
  }
}
```

**New Flow (Redis):**
```javascript
async function handlePhotoState(phone, text, buttonId, session, res) {
  if (userText === 'done') {
    // Get photos from Redis (instant, accurate)
    const photoUrls = await getPhotos(phone);
    const photoCount = photoUrls.length;

    console.log(`User done. Photos in Redis: ${photoCount}`);

    // Transfer to Supabase session for persistence
    session.photos = photoUrls;
    await saveSession(phone, session);

    // Clear Redis (photos now in Supabase)
    await clearPhotos(phone);

    // Move to next state
    session.state = 'awaiting_additional_details';
    await saveSession(phone, session);

    // Show summary with CORRECT count
    await sendButtons(phone,
      `Great! Got ${photoCount} photo${photoCount !== 1 ? 's' : ''} 📸\n\nAny flaws or special notes?`,
      [
        { id: 'skip_details', title: 'NO, SKIP' },
        { id: 'add_details', title: 'YES, ADD' }
      ]
    );

    return res.status(200).json({ status: 'asked details' });
  }

  // Any other text
  await sendMessage(phone, "Send photos or text DONE when finished! 📸");
  return res.status(200).json({ status: 'waiting' });
}
```

**Key Changes:**
- ✅ Remove 2-second delay
- ✅ Get accurate count from Redis
- ✅ Transfer photos to Supabase only after DONE
- ✅ Clean up Redis after transfer

---

### Phase 4: Update Submit Handler (10 mins)

**Change:**
```javascript
async function submitListing(phone, session, res) {
  // Photos are already in session.photos (transferred on DONE)
  const photoUrls = session.photos.filter(url => url);

  // ... rest stays the same
}
```

**After successful submit:**
```javascript
// Clean up Redis (redundant check, but safe)
await clearPhotos(phone);
```

---

### Phase 5: Clean Up Session Schema (10 mins)

**Remove from session metadata (no longer needed):**
- `processedMediaIds` (Redis handles dedup)
- `lastPhotoResponseAt` (unused)

**Keep:**
- `processedMessages` (for message-level idempotency)
- `shopify_product_id` (needed)
- `created_at` (needed)

---

## Testing Checklist (30 mins)

### Test 1: Single Photo
1. SELL → email → description → fields
2. Send 1 photo
3. Text DONE
4. **Expected:** Summary shows "Photos: 1"
5. Submit
6. **Expected:** Success, listing in DB with 1 photo

### Test 2: Photo Burst (CRITICAL)
1. SELL → email → description → fields
2. **Send 3 photos rapidly** (< 2 seconds apart)
3. Text DONE
4. **Expected:** Summary shows "Photos: 3" ✅
5. Submit
6. **Expected:** Success, listing in DB with 3 photos ✅

### Test 3: Duplicate Photo
1. Start flow
2. Send photo A
3. Send photo A again (same media ID)
4. Text DONE
5. **Expected:** Summary shows "Photos: 1" (dedup worked)

### Test 4: More Than 3 Photos
1. Start flow
2. Send 5 photos
3. Text DONE
4. **Expected:** Summary shows "Photos: 5"
5. Submit
6. **Expected:** Success, all 5 photos in DB

### Test 5: Interrupted Flow
1. Start flow
2. Send 2 photos
3. Wait 10 minutes
4. Send 1 more photo
5. Text DONE
6. **Expected:** Summary shows "Photos: 3"
7. Submit
8. **Expected:** Success

### Test 6: Redis Expiry
1. Start flow
2. Send 2 photos
3. Wait 61 minutes (Redis TTL expires)
4. Text DONE
5. **Expected:** Shows "Photos: 0" (expired from Redis)
6. **Action:** Ask for photos again

---

## Rollback Plan (2 mins if needed)

If ANYTHING breaks:

```bash
# Option 1: Git revert
git log --oneline -5  # Find commit before Redis changes
git revert <commit-hash>
vercel --prod --force

# Option 2: Restore backup
cp api/sms-webhook-backup-v1.js api/sms-webhook.js
git add api/sms-webhook.js
git commit -m "rollback: restore working backup"
vercel --prod --force
```

**Recovery time:** < 3 minutes

---

## Timeline Breakdown

| Phase | Task | Time | Who |
|-------|------|------|-----|
| **Setup** | Create Vercel KV | 5 min | YOU |
| | Install package | 2 min | ME |
| | Create helper module | 8 min | ME |
| **Code** | Update handlePhoto | 15 min | ME |
| | Update handlePhotoState | 10 min | ME |
| | Update submit handler | 5 min | ME |
| | Clean up session schema | 5 min | ME |
| **Deploy** | Commit & push | 2 min | ME |
| | Vercel deploy | 2 min | AUTO |
| **Test** | Run all 6 test scenarios | 30 min | YOU + ME |
| **Buffer** | Fix any issues | 15 min | ME |
| **TOTAL** | | **99 min** | |

**Remaining buffer:** 21 minutes for unexpected issues

---

## Risk Assessment

### Low Risk ✅
- Redis operations are atomic (can't break concurrency)
- Backup exists (`sms-webhook-backup-v1.js`)
- Can rollback in < 3 minutes
- Conversation flow unchanged (users won't notice)
- Vercel KV free tier sufficient (30k ops/month)

### What Could Go Wrong?
1. **Redis connection fails** → Webhook returns 500
   - **Mitigation:** Add try-catch, fallback to old behavior

2. **Redis quota exceeded** → Operations fail
   - **Mitigation:** Free tier = 30k ops/month (plenty for Sunday)

3. **Import fails (ESM vs CommonJS)** → Deployment breaks
   - **Mitigation:** Test locally first with `vercel dev`

4. **Photo URLs not transferring** → Summary shows 0
   - **Mitigation:** Add extensive logging, check Redis manually

---

## What We're NOT Changing

✅ **Keep as-is (no risk):**
- Auth flow (already perfect)
- Conversation messages
- Button interactions
- AI extraction
- Field validation
- Shopify draft creation
- Database schema
- All other webhook handlers

❌ **Not doing (too risky before Sunday):**
- GraphQL rewrite
- Remove early draft creation
- Change database schema
- New authentication system
- Major refactors

---

## Post-Sunday Improvements

After focus group, consider:
1. GraphQL file upload (no product ID needed)
2. Better error recovery
3. Retry mechanisms
4. Photo preview in WhatsApp
5. Admin dashboard for Redis monitoring

---

## Decision Points

### Before We Start, Confirm:

**1. Do you have access to Vercel KV?**
- [ ] Yes, I can create KV database
- [ ] No, need to enable it first

**2. Acceptable risk level?**
- [ ] Yes, proceed with Redis implementation
- [ ] No, too risky for Sunday (stick with current + 2s delay)

**3. Alternative if Redis fails?**
- [ ] Plan A: Redis (99 min)
- [ ] Plan B: Increase delay to 5s + better logging (10 min)
- [ ] Plan C: Accept current behavior, document workaround for users

---

## Success Criteria

✅ **Must achieve before Sunday:**
1. 3 photos sent rapidly → All 3 save correctly
2. Summary shows correct photo count
3. Submission works with all photos
4. No "Photos: 0" errors
5. No regression in conversation flow

✅ **Nice to have:**
6. Faster than current (no 2s delay)
7. Better logging for debugging
8. Cleaner code (no processedMediaIds hack)

---

## Final Checklist

Before going live:
- [ ] All 6 test scenarios pass
- [ ] Vercel logs show no errors
- [ ] Photos visible in Shopify admin
- [ ] Listings save correctly to DB
- [ ] Summary shows accurate counts
- [ ] No timeout errors (Vercel 10s limit)
- [ ] Redis ops under quota
- [ ] Backup file exists
- [ ] Team knows rollback procedure

---

**Ready to proceed?**
- Say "GO" to start implementation
- Say "WAIT" if you need to review anything
- Say "PLAN B" if Redis is too risky

**Your call!** 🚀
