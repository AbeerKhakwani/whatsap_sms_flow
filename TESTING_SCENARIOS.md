# WhatsApp Sell Flow - Testing Scenarios for Sunday Demo

## Pre-Test Setup

1. **Reset your test account**: Text `RESET` to clear session
2. **Clear browser cache** if testing seller dashboard
3. **Have test photos ready**: Front view, back view, designer tag

---

## Scenario A: New User (Email Not in System)

**Goal**: Test account creation flow for brand new seller

### Steps:

1. **User**: `SELL`
   - ✅ **Expect**: "What's your email?"

2. **User**: `notanemail`
   - ✅ **Expect**: "doesn't look right… try you@example.com"

3. **User**: `newuser@test.com`
   - ✅ **Expect**: "New here? Let's create your account!"
   - ✅ **Expect**: Buttons: "YES ✓" / "CANCEL"

4. **Tap**: `YES ✓`
   - ✅ **Expect**: "Account created! ✓"
   - ✅ **Expect**: "Describe your item (voice or text)..."

5. **User**: `Maria B lawn 3pc, M, like new, $80`
   - ✅ **Expect**: Summary shown
   - ✅ **Expect**: Asks for missing fields one by one

6. Complete missing fields
   - ✅ **Expect**: "Perfect! Now send 3+ photos..."

7. Send 3 photos (one at a time or all at once)
   - ✅ **Expect**: At most ONE response saying "Got 3/3 photos" or "Perfect! Got 3 photos"
   - ❌ **Bug**: Multiple "Got X/3" messages = idempotency broken

8. **Tap**: `SUBMIT ✓` OR type `submit`
   - ✅ **Expect**: "Submitting now..." then success message
   - ✅ **Expect**: Shows summary with designer, size, price
   - ❌ **Bug**: "additional details" question = submit flow broken

### Edge Case: Cancel Account Creation

1. Steps 1-3 from above
2. **Tap**: `CANCEL`
   - ✅ **Expect**: "Cancelled. Reply SELL when ready."
   - ✅ **Expect**: Session reset

---

## Scenario B: Returning User (Email + Phone Match)

**Goal**: Test 7-day session persistence

### Steps:

1. **User**: `SELL`
   - ✅ **Expect**: Skips email question (if within 7 days)
   - ✅ **Expect**: "Welcome back! ✓"
   - ✅ **Expect**: "Describe your item..."

2. **User**: `Sana Safinaz kurta S excellent $50`
   - ✅ **Expect**: Proceeds directly to missing fields

3. Complete flow normally
   - ✅ **Expect**: No account creation prompt

### Edge Case: Session Expired (>7 days)

1. **User**: `SELL` (after 7+ days)
   - ✅ **Expect**: "What's your email?"
   - ✅ **Expect**: Session resets, asks for email again

---

## Scenario C: Email Exists But Wrong Phone

**Goal**: Test security - prevent email hijacking

### Steps:

1. Use a different phone number than registered
2. **User**: `SELL`
3. **User**: `existingemail@test.com` (email from different phone)
   - ✅ **Expect**: "This email is linked to another phone..."
   - ✅ **Expect**: Blocks listing

---

## Scenario D: Mid-Flow Resume (CONTINUE/RESTART)

**Goal**: Test resume functionality when user types SELL mid-flow

### Test D1: Resume from Missing Fields

1. Start listing: `SELL` → provide email → describe item
2. Stop mid-way (e.g., after designer question)
3. **User**: `SELL`
   - ✅ **Expect**: "You're already listing an item. Continue where you left off?"
   - ✅ **Expect**: Buttons: "CONTINUE" / "RESTART"

4. **Tap**: `CONTINUE`
   - ✅ **Expect**: Resumes at next missing field
   - ❌ **Bug**: Asks email again = resume broken

5. Complete fields and photos
   - ✅ **Expect**: Submit works normally

### Test D2: Resume from Photo Stage

1. Start listing → complete all fields → send 2 photos
2. **User**: `SELL`
   - ✅ **Expect**: Resume prompt

3. **Tap**: `CONTINUE`
   - ✅ **Expect**: "You have 2 photos. Send 1 more 📸"
   - ✅ **Expect**: Can add more photos

### Test D3: Restart Fresh

1. Mid-flow, type: `SELL`
2. **Tap**: `RESTART`
   - ✅ **Expect**: "What's your email?"
   - ✅ **Expect**: All previous progress cleared

---

## Scenario E: Photo Upload Spam Test

**Goal**: Ensure no duplicate "Got X/3" messages

### Steps:

1. Start listing → reach photo stage
2. **Send 2 photos back-to-back** (as fast as possible)
   - ✅ **Expect**: At most ONE message like "Got 2/3"
   - ❌ **Bug**: Multiple "Got 1/3", "Got 2/3" = photo spam not fixed

3. **Send 1 more photo**
   - ✅ **Expect**: "Perfect! Got 3 photos. Ready to submit?"
   - ✅ **Expect**: Buttons: "SUBMIT ✓" / "ADD MORE"

4. **Send 2 more photos** (now 5 total)
   - ✅ **Expect**: Only ONE response updating count

---

## Scenario F: Submit Reliability (Retry Logic)

**Goal**: Test that retry doesn't create duplicate Shopify drafts

### Steps:

1. Complete listing → upload 3 photos
2. **Tap**: `SUBMIT ✓`
3. **If submission fails** (simulate by checking logs for error):
   - ✅ **Expect**: Error message shown to user
   - ✅ **Expect**: Draft ID saved in session

4. **Type**: `submit` (retry)
   - ✅ **Expect**: Reuses existing Shopify draft (check logs for "♻️ Reusing existing draft")
   - ❌ **Bug**: Creates new draft = duplicate drafts in Shopify

5. Check Shopify admin
   - ✅ **Expect**: Only ONE draft product created
   - ❌ **Bug**: Multiple drafts with same name = retry logic broken

---

## Scenario G: Typed "submit" vs Button Click

**Goal**: Ensure both methods work identically

### Steps:

1. Complete listing → 3 photos
2. **Type**: `submit` (lowercase)
   - ✅ **Expect**: Submits successfully
   - ❌ **Bug**: "I don't understand" or asks for additional details

3. In another test, **Tap**: `SUBMIT ✓` button
   - ✅ **Expect**: Same behavior as typed submit

---

## Scenario H: WhatsApp API Errors

**Goal**: Check for "Something went wrong. Try again later." bubbles

### What to Watch For:

- ❌ **Red bubble** = WhatsApp delivery failed
- Common causes:
  - Invalid button format
  - Too many buttons (>3)
  - List message exceeds 10 items
  - Rate limiting

### How to Debug:

1. Check Vercel logs: `vercel logs --since=5m`
2. Look for:
   - 400 errors from WhatsApp API
   - Response body errors
   - Rate limit warnings

---

## Scenario I: AI Extraction Test

**Goal**: Verify AI extracts fields correctly from description

### Test Cases:

1. **User**: `Elan formal 3 piece XL new with tags 120`
   - ✅ **Expect**: Extracts:
     - Designer: Elan
     - Pieces: 3-piece
     - Size: XL
     - Condition: New with tags
     - Price: $120

2. **User**: `Maria B lawn kurta only medium like new fifty dollars`
   - ✅ **Expect**: Extracts:
     - Designer: Maria B
     - Pieces: Kurta
     - Size: M
     - Condition: Like new
     - Price: $50

3. **User**: `sana`
   - ✅ **Expect**: Shows summary with partial info
   - ✅ **Expect**: Asks for missing designer field

---

## Scenario J: Pieces Selection (3 Buttons)

**Goal**: Test simplified pieces question

### Steps:

1. Start listing → reach "How many pieces?" question
2. ✅ **Expect**: 4 buttons shown:
   - Kurta only
   - 2-piece
   - 3-piece
   - Other

3. **Tap**: `Kurta only`
   - ✅ **Expect**: Accepts and moves to next field

4. In another test, **Tap**: `Other`
   - ✅ **Expect**: "Please explain what pieces are included:"
   - **User**: `Lehnga with choli and dupatta`
   - ✅ **Expect**: Stores as "Other (Lehnga with choli and dupatta)"

---

## Quick Smoke Test (5 minutes)

**For rapid pre-demo check:**

1. ✅ New user: `SELL` → email → describe → fields → photos → submit
2. ✅ Returning user: `SELL` → skips email → describe → submit
3. ✅ Mid-flow: Start listing → type `SELL` → see resume prompt
4. ✅ Photo spam: Send 3 photos at once → only ONE response
5. ✅ Retry: Submit → fail → retry → check for duplicate drafts

---

## Known Issues to Watch For

| Issue | What to Look For | Root Cause |
|-------|-----------------|------------|
| Photo spam | Multiple "Got X/3" messages | `lastPhotoResponseAt` not persisting |
| Idempotency broken | Same message processed twice | `processedMessages` not persisting |
| Duplicate drafts | Multiple Shopify products for same listing | `shopify_product_id` not persisting |
| Session expires immediately | Always asks email | `created_at` not persisting |
| Submit doesn't work | Shows "additional details" question | SUBMIT flow not going directly to submit |
| Resume broken | Resets instead of resuming | Session state not preserved |

---

## Success Criteria for Sunday Demo

✅ **Must work:**
- New user can create account and list item
- Photos don't spam messages
- Submit works on first try
- No duplicate Shopify drafts

✅ **Should work:**
- 7-day session persistence
- Mid-flow resume
- Retry after failure

✅ **Nice to have:**
- AI extraction accuracy
- Clean error messages
- Fast response times

---

## Testing Checklist

Before Sunday demo:

- [ ] Test with fresh phone number (Scenario A)
- [ ] Test with existing account (Scenario B)
- [ ] Test photo spam (Scenario E)
- [ ] Test submit reliability (Scenario F)
- [ ] Test mid-flow resume (Scenario D)
- [ ] Check Shopify for duplicates
- [ ] Check Vercel logs for errors
- [ ] Test on actual WhatsApp (not just API simulator)

---

## Emergency Commands

- `RESET` - Clear your session
- `SELL` - Start fresh listing
- Check logs: `vercel logs --since=10m`
- Check sessions: Query `whatsapp_sessions` table in Supabase

---

## Notes

- All fixes deployed to `sell.thephirstory.com`
- Session metadata now stored in `listing._meta` JSONB field
- No database schema changes required
- Previous sessions will auto-migrate on next interaction
