# WhatsApp Flow - Complete Rebuild Plan

## Current Bugs

1. **State jumping**: Email → Photos (skipping description & fields)
2. **Photos not saving**: Session shows 0 photos even after sending 6
3. **Draft created incorrectly**: Has product details but no photos

## Root Cause

The state machine has too many edge cases and isn't properly resetting between flows. Old session data is causing states to skip ahead.

## New Simple Flow

```
1. SELL
   → state: awaiting_email
   → Bot: "What's your email?"

2. Email received
   → Validate email
   → If existing: Welcome back
   → If new: Create account
   → **RESET EVERYTHING** (clear listing, photos, etc)
   → state: awaiting_description
   → Bot: "Describe your item"

3. Description received
   → Extract with AI
   → Save to session.listing
   → state: awaiting_missing_field
   → Bot: Ask for first missing field

4. Field answered
   → Save field
   → If more missing: Ask next
   → If all complete: GO TO STEP 5

5. All fields complete
   → **CREATE SHOPIFY DRAFT**
   → state: collecting_photos
   → Bot: "Send at least 3 photos. Text DONE when finished."

6. Photo received
   → Download & compress
   → Upload to Shopify
   → Get CDN URL
   → **SAVE URL TO SESSION**
   → (silent - no message)

7. User texts "DONE"
   → state: awaiting_additional_details
   → Bot: "Any flaws or notes?"

8. User answers or skips
   → state: ready_to_submit
   → Bot: Show summary with photo count
   → Buttons: SUBMIT / CANCEL

9. User clicks SUBMIT
   → Validate: must have >= 3 photos
   → If < 3: state back to collecting_photos
   → If >= 3: Insert to DB, send success
```

## Critical Fixes Needed

### 1. Reset Session After Email
```javascript
async function handleEmail(phone, text, session, res) {
  // ... validate email ...

  // CRITICAL: Complete reset
  session.email = email;
  session.listing = {
    _seller_id: seller.id,
    _seller_name: seller.name
    // NO OTHER FIELDS - start fresh!
  };
  session.photos = [];  // Clear old photos
  session.shopify_product_id = null;  // Clear old draft
  session.state = 'awaiting_description';
  session.current_field = null;
  session.prev_state = null;

  await saveSession(phone, session);
  await sendMessage(phone, "Describe your item...");
}
```

### 2. Only Create Draft ONCE
```javascript
async function askNextMissingField(phone, session, res) {
  const missing = getMissingFields(session.listing);

  if (missing.length === 0) {
    // ONLY create draft if it doesn't exist yet
    if (!session.shopify_product_id) {
      const draftCreated = await createDraftForSession(phone, session);
      if (!draftCreated) {
        await sendMessage(phone, "Error creating draft");
        return res.status(200).json({ status: 'error' });
      }
    }

    session.state = 'collecting_photos';
    session.photos = session.photos || [];  // Initialize if needed
    await saveSession(phone, session);

    await sendMessage(phone, "Send at least 3 photos. Text DONE when finished.");
    return res.status(200).json({ status: 'asked photos' });
  }

  // Ask for next missing field...
}
```

### 3. Fix Photo Upload
```javascript
async function handlePhoto(phone, mediaId, session, res) {
  // Re-fetch session FIRST
  const latestSession = await getSession(phone);

  // Check state
  if (latestSession.state !== 'collecting_photos') {
    return res.status(200).json({ status: 'wrong state' });
  }

  // Check if draft exists
  if (!latestSession.shopify_product_id) {
    await sendMessage(phone, "Draft not ready. Please wait...");
    return res.status(200).json({ status: 'no draft' });
  }

  // Download, compress, upload
  const base64 = await bufferToOptimizedJpegBase64(mediaBuffer);

  const photoRes = await fetch(`${API_BASE}/api/wa-product-image?action=add`, {
    method: 'POST',
    body: JSON.stringify({
      productId: latestSession.shopify_product_id,
      base64,
      filename: `wa_${mediaId}.jpg`
    })
  });

  const photoData = await photoRes.json();

  // Validate URL
  if (!photoData.imageUrl) {
    await sendMessage(phone, "Photo failed. Resend please!");
    return res.status(200).json({ status: 'no url' });
  }

  // Save URL to session
  latestSession.photos = latestSession.photos || [];
  latestSession.photos.push({
    imageUrl: photoData.imageUrl,
    imageId: photoData.imageId,
    mediaId: mediaId
  });

  await saveSession(phone, latestSession);

  console.log(`✅ Photo ${latestSession.photos.length} saved: ${photoData.imageUrl}`);

  // Only send message on first photo
  if (latestSession.photos.length === 1) {
    await sendMessage(phone, "Got it! Keep sending. Text DONE when finished.");
  }

  return res.status(200).json({ status: 'photo saved', count: latestSession.photos.length });
}
```

### 4. Fix DONE Handler
```javascript
async function handlePhotoState(phone, text, buttonId, session, res) {
  const userText = (text || '').trim().toLowerCase();

  if (userText === 'done') {
    // Re-fetch to get latest photos
    const fresh = await getSession(phone);
    const photoCount = (fresh.photos || []).filter(p => p.imageUrl).length;

    console.log(`✅ User done. Photo count: ${photoCount}`);

    fresh.state = 'awaiting_additional_details';
    await saveSession(phone, fresh);

    await sendButtons(phone,
      `Great! Got ${photoCount} photo(s) 📸\n\nAny flaws or notes?`,
      [
        { id: 'skip_details', title: 'NO, SKIP' },
        { id: 'add_details', title: 'YES, ADD' }
      ]
    );

    return res.status(200).json({ status: 'asked details' });
  }

  // Any other text - remind them
  await sendMessage(phone, "Send photos or text DONE when finished!");
  return res.status(200).json({ status: 'waiting' });
}
```

### 5. Fix Summary
```javascript
async function handleAdditionalDetails(phone, text, buttonId, session, res) {
  if (buttonId === 'skip_details') {
    // Re-fetch session for latest photos
    const fresh = await getSession(phone);
    const listing = fresh.listing;
    const photoCount = (fresh.photos || []).filter(p => p.imageUrl).length;

    console.log(`📊 Summary - Photos: ${photoCount}`);

    fresh.state = 'ready_to_submit';
    await saveSession(phone, fresh);

    const summary =
      `📋 Ready to submit!\n\n` +
      `📦 ${listing.designer} ${listing.item_type || ''}\n` +
      `📏 Size: ${listing.size}\n` +
      `✨ Condition: ${listing.condition}\n` +
      `💰 Price: $${listing.asking_price_usd}\n` +
      `📸 Photos: ${photoCount}\n\n` +
      `Look good?`;

    await sendButtons(phone, summary, [
      { id: 'submit', title: 'YES, SUBMIT ✓' },
      { id: 'cancel', title: 'CANCEL' }
    ]);

    return res.status(200).json({ status: 'ready' });
  }
}
```

## Implementation Steps

1. **Add debug logging everywhere**
   - Log state transitions
   - Log photo saves
   - Log session fetches

2. **Reset completely after email**
   - Clear all old data
   - Start fresh listing

3. **Only create draft once**
   - Check if `shopify_product_id` exists
   - Don't recreate

4. **Always re-fetch session**
   - Before photo upload
   - Before DONE
   - Before summary

5. **Validate at every step**
   - Check state before processing
   - Check draft exists before photo upload
   - Check photo count at submit

## Testing Plan

1. Fresh flow: SELL → Email → Description → Fields → Photos → DONE → Submit
2. Resume flow: Start → Stop midway → Resume
3. Error flow: Try to submit with 0 photos
4. Retry flow: Submit fails → Send more photos → Submit again
