# WhatsApp Bot Test Checklist

Run through each scenario and check off when working.

## Auth Flow

### New User
- [ ] Text "hi" from new number → "Have you sold with us before?"
- [ ] Reply "no" → "What email for your account?"
- [ ] Enter valid email → "You're in!" + menu buttons
- [ ] Verify seller created in Supabase

### Existing User (phone not linked)
- [ ] Text "hi" from new number → "Have you sold with us before?"
- [ ] Reply "yes" → "What email did you sign up with?"
- [ ] Enter correct email → "Welcome back!" + menu buttons
- [ ] Enter wrong email 3x → Offers to create new account
- [ ] Verify phone linked to seller in Supabase

### Session Management
- [ ] LOGOUT command → "You've been logged out"
- [ ] After logout, try SELL → Asks for email verification
- [ ] HELP command → Shows help text
- [ ] MENU command → Shows menu with buttons

---

## Sell Flow - Form Path

### Input Selection
- [ ] Tap SELL → "How would you like to share details?" with 3 buttons
- [ ] Tap FORM → "What's the designer/brand name?"

### Form Questions
- [ ] Enter designer (e.g. "Sana Safinaz") → Item type buttons appear
- [ ] Tap "3-Piece Suit" → Size buttons appear
- [ ] Tap "M" → Condition buttons appear
- [ ] Type custom size "XL" instead → Should accept and show condition
- [ ] Tap "Like new" → "What's your asking price?"
- [ ] Enter "75" → "Send me photo of brand tag"

### Photo Collection
- [ ] Send 1 photo → "Great! Send me 3 photos of the item"
- [ ] Send 3 photos at once → Should batch (1 response, not 3)
- [ ] Summary shown with all details + photo counts

### Interruption Handling
- [ ] Mid-flow, tap old TEXT button → "You're already listing X! Continue or Start Fresh?"
- [ ] Tap CONTINUE → Resumes where left off
- [ ] Tap START FRESH → Clears draft, shows input method selection

---

## Sell Flow - Text Path

- [ ] Tap TEXT → "Tell me about your item..."
- [ ] Send description "Elan kurta size L like new $100"
- [ ] AI extracts fields → Asks for missing info
- [ ] Complete all fields → Summary shown

---

## Sell Flow - Voice Path

- [ ] Tap VOICE → "Send me a voice note..."
- [ ] Send voice note describing item
- [ ] Transcription works → AI extracts fields

---

## Photo Validation

### Same Outfit Check
- [ ] Send 3 photos of SAME outfit → Accepts, shows summary
- [ ] Send photos of DIFFERENT items → "Photos look like different items, start fresh"

### Photo Batching
- [ ] Send 5+ photos at once → Single response (not 5 responses)
- [ ] Photos all saved to listing

---

## Confirmation & Submit

- [ ] At summary, tap SUBMIT → "Done! Your listing is submitted"
- [ ] Tap EDIT → "What do you want to change?"
- [ ] Tap CANCEL → "Draft deleted"
- [ ] After submit, verify Shopify draft product created

---

## Edge Cases

### Rate Limiting
- [ ] Try 10+ wrong emails → "Too many attempts, try again in an hour"

### Draft Recovery
- [ ] Start listing, leave mid-way
- [ ] Come back hours later, say SELL
- [ ] Should find draft: "You have a draft, continue or start fresh?"

### Global Commands Mid-Flow
- [ ] Mid-listing, say "menu" → Should go to menu
- [ ] Mid-listing, say "help" → Should show help
- [ ] Mid-listing, say "exit" → "Draft saved!"

### Invalid Input
- [ ] At price prompt, enter "abc" → "That doesn't look like a price"
- [ ] At photo prompt, send text → Re-asks for photo

---

## Test Phone Numbers

Use these for testing:
- New user: (your test number)
- Existing seller: (a number already in DB)

## Quick Smoke Test (5 min)

1. Send "menu" → Get menu buttons
2. Tap SELL → Get input options
3. Tap FORM → Go through all questions
4. Send photos → Get summary
5. Tap SUBMIT → Verify in Shopify

---

## Bugs Found

| Date | Issue | Status |
|------|-------|--------|
| | | |
