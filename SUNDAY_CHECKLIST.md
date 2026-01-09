# Sunday Demo - Quick Test Checklist

## ✅ What's Now Solid

- **Resume flow**: prev_state saved before overwriting state ✅
- **7-day session**: created_at only set once, never refreshed ✅
- **Pieces UI**: Clean 3 buttons (Kurta / 2-piece / 3-piece) ✅
- **Photo UI**: "SUBMIT ✓ / ADD MORE" buttons ✅
- **No extra questions**: Goes straight to submit after photos ✅
- **Metadata persistence**: _meta preserved when resetting listing ✅
- **Global submit**: Typing "submit" works from any state ✅

---

## Quick Test Scenarios (Copy/Paste)

### A) New User (No Seller Account)

```
User: SELL
→ Expect: "What's your email?"

User: notanemail
→ Expect: "doesn't look right…"

User: newuser@test.com
→ Expect: "Create account?" → YES/CANCEL buttons

Tap: YES
→ Expect: "Account created! ✓ Describe your item…"

User: Maria B lawn 3pc M like new $80
→ Expect: Summary + asks missing fields

Complete missing fields
→ Expect: "Perfect! send 3 photos…"

Send 3 photos (quickly, all at once)
→ Expect: Single "Perfect! Got 3 photos… SUBMIT ✓"

Tap: SUBMIT ✓
→ Expect: Success message
```

**Watch for bugs:**
- ❌ Multiple "Got X/3" messages = photo spam not fixed
- ❌ "Additional details" question = extra step not removed
- ❌ Multiple Shopify drafts = duplicate prevention broken

---

### B) Returning User (7-Day Session)

```
User: SELL

User: existing@email.com (same phone as registered)
→ Expect: "Welcome back! ✓ Describe your item…"
→ Should NOT ask "Create account?"

Complete flow normally
→ Expect: Submit works
```

**Watch for bugs:**
- ❌ Asks email every time = session persistence broken
- ❌ Asks "Create account?" = not recognizing existing seller

---

### C) Existing Email BUT Wrong Phone

```
Use different phone number

User: SELL

User: existing@email.com (tied to different phone)
→ Expect: "This email is linked to another phone…"
→ Should block listing
```

---

### D) Mid-Flow Resume (Missing Fields)

```
Start listing → describe item → get to "What condition?"

User: SELL
→ Expect: "Continue where you left off?" → CONTINUE/RESTART

Tap: CONTINUE
→ Expect: Returns to "What condition?" question
```

**Watch for bugs:**
- ❌ Asks email again = resume broken
- ❌ Resets progress = prev_state not working

---

### E) Mid-Flow Resume (Photos)

```
Start listing → complete fields → upload 1 photo

User: SELL
→ Expect: "Continue where you left off?"

Tap: CONTINUE
→ Expect: "You have 1 photo. Send 2 more 📸"

Send 2 more photos quickly
→ Expect: Single "Perfect! Got 3 photos… SUBMIT ✓"
```

---

### F) Typed "submit" Reliability

**Test F1: With 3+ Photos**
```
Reach photo stage → upload 3 photos

Type: submit
→ Expect: Submits successfully (same as tapping SUBMIT ✓)
```

**Test F2: With <3 Photos**
```
Reach photo stage → upload 1 photo

Type: submit
→ Expect: "You can submit after 3 photos. Need 2 more 📸"
```

**Test F3: Not in Photo Stage**
```
At email question or missing field

Type: submit
→ Expect: "You're not in photo upload yet. Reply SELL to start a listing."
```

**Watch for bugs:**
- ❌ "I don't understand" = global submit not working
- ❌ Only button tap works = typed submit broken

---

### G) Draft Reuse After Failure

**Simulate failure scenario:**
```
Complete listing → 3 photos → SUBMIT

(If submission fails - check logs for error)

→ Expect: Bot says something like "Try again" or similar error

Type: SUBMIT
→ Expect: Retries using same shopify_product_id (check logs for "♻️ Reusing existing draft")
→ Should NOT create duplicate Shopify product
```

**Check Shopify Admin:**
- ✅ Only ONE draft product for this listing
- ❌ Multiple drafts with same name = retry logic broken

---

### H) Photo Spam Test (Critical!)

```
Start listing → reach photo stage

Send 3 photos AS FAST AS POSSIBLE (back-to-back)
→ Expect: At most ONE response message
→ Good: "Perfect! Got 3 photos…"
→ Bad: "Got 1/3" then "Got 2/3" then "Got 3/3" = SPAM

Send 2 more photos (now 5 total)
→ Expect: Single response updating count
```

**Watch for bugs:**
- ❌ Multiple "Got X/3" messages = idempotency or lastPhotoResponseAt broken

---

## Critical Bug Checklist

| Bug | Test | How to Spot | Status |
|-----|------|-------------|--------|
| Photo spam | Send 3 photos at once | Multiple "Got X/3" messages | Should be fixed ✅ |
| Duplicate drafts | Submit → fail → retry | Multiple Shopify products | Should be fixed ✅ |
| Session expires | SELL after 5 minutes | Always asks email | Should be fixed ✅ |
| Resume broken | SELL mid-flow → CONTINUE | Resets instead of resuming | Should be fixed ✅ |
| Metadata lost | Complete flow as returning user | created_at, shopify_product_id lost | Should be fixed ✅ |
| Submit only button works | Type "submit" instead of tapping | "I don't understand" | Should be fixed ✅ |

---

## Pre-Demo Sanity Check (2 minutes)

1. **Quick new user flow**: SELL → email → describe → photos → submit
   - ✅ Works end-to-end
   - ❌ Any errors = STOP, debug

2. **Photo spam check**: Send 3 photos at once
   - ✅ Single response
   - ❌ Multiple responses = CRITICAL BUG

3. **Shopify check**: Open Shopify admin after test
   - ✅ Single draft product
   - ❌ Duplicates = CRITICAL BUG

4. **Logs check**: Run `vercel logs --since=5m`
   - ✅ No errors, clean flow
   - ❌ Errors in logs = investigate

---

## Emergency Commands

- `RESET` - Clear session (for testing)
- `SELL` - Start fresh listing
- `CANCEL` - Cancel current listing
- `SUBMIT` - Submit from photo stage (global command)

---

## What to Say in Demo

**Opening:**
"We've built a WhatsApp-based selling experience. Sellers can list items by just texting us - no app needed."

**Show flow:**
1. Text SELL to start
2. Enter email (creates account if new)
3. Describe item in natural language
4. AI extracts details, asks for missing info
5. Upload 3 photos
6. Tap SUBMIT - done!

**Key features to highlight:**
- ✅ Natural language input (voice or text)
- ✅ Session persistence (come back within 7 days)
- ✅ Resume mid-flow (type SELL anytime to continue)
- ✅ Simple UI (buttons for quick selection)
- ✅ Auto-creates Shopify drafts for admin review

**What NOT to say:**
- ❌ Don't mention bugs we fixed
- ❌ Don't over-promise features not built yet
- ❌ Don't demo edge cases (wrong phone, errors, etc.)

---

## If Something Goes Wrong During Demo

**Photo spam happens:**
- "Ah, looks like WhatsApp is processing those photos. Give it a sec..."
- Switch to single photo upload instead of batch

**Submit fails:**
- "The connection hiccupped. One sec..."
- Type `SUBMIT` to retry
- If still fails: "Let me check that after - moving on..."

**Session resets unexpectedly:**
- "Let me start fresh to show the full flow..."
- Use it as opportunity to demo new user experience

**Bot doesn't respond:**
- Check Vercel logs: `vercel logs --since=1m`
- Restart if needed
- Have backup phone number ready

---

## Post-Demo Debrief

**Collect feedback on:**
1. Was the flow intuitive?
2. Did buttons make sense?
3. Any confusing messages?
4. What features did they ask for?

**Document:**
- What worked well
- What broke (if anything)
- Feature requests from audience
- Ideas for v2

---

## All Fixed Issues (For Reference)

✅ Session metadata persistence (created_at, processedMessages, lastPhotoResponseAt, shopify_product_id, prev_state)
✅ Photo spam prevention (lastPhotoResponseAt persists)
✅ Idempotency (processedMessages persists)
✅ Duplicate Shopify drafts (shopify_product_id persists for retry)
✅ 7-day session check (created_at only set once)
✅ Resume flow (prev_state saved before overwriting)
✅ SUBMIT button wording ("SUBMIT ✓" not "CONTINUE ›")
✅ Direct submit (no additional_details step)
✅ Pieces simplified (3 buttons only)
✅ _meta preservation (when resetting listing)
✅ Global submit handler (works from any state)

---

**Good luck! 🚀**
