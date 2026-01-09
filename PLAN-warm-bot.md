# Plan: Make the Bot Feel Human

## Problem Summary
Bot feels robotic. Users don't know if they were understood. No clear next steps. Aunty Approval Rate: 0%

## Design Principles

### 1. Every Response = Confirm + Next Step
```
❌ Bad: "Now send 3 more photos"
✅ Good: "Got it! Maria B kurta, size M, like new, $80 💛 Now send me 3 photos!"
```

### 2. Warm Acknowledgment Patterns
- "Ooh I love [brand]!" for popular brands
- "Perfect!" / "Got it!" / "Noted!" for confirmations
- "No worries!" for confusion/mistakes
- "Take your time!" for interruptions

### 3. Clear Next Step Always
Every response ends with ONE clear action:
- "What's the size?"
- "Send me photos now 📸"
- "Reply 1 to submit!"

### 4. Handle Interruptions Gracefully
"brb", "one sec", "wait", "hold on" →
"No problem! Your draft is saved. Just pick up where you left off when you're ready 💛"

## Implementation Plan

### Phase 1: Rewrite Static Messages (messages.js)
Make every message warm with confirmation + next step pattern

### Phase 2: Add Interruption Handling
Detect pause words and respond patiently

### Phase 3: Price Guidance
When user asks about pricing, give actual helpful guidance

### Phase 4: Explain Skip
Never use "skip" without explaining what it does

### Phase 5: Brand Celebration
When we recognize a brand, celebrate it! "Ooh Maria B! Love that designer 💛"

---

## Specific Changes

### A. Interruption Words (sms-webhook.js)
```javascript
const pauseWords = ['wait', 'hold on', 'one sec', 'brb', 'gimme a min', 'sec', 'hold', 'ruko'];
if (pauseWords.some(w => lower.includes(w))) {
  return `No problem, take your time! 💛\n\nYour draft is saved - just continue when you're ready.`;
}
```

### B. Price Guidance (sms-webhook.js)
```javascript
if (lower.includes('how much') && (lower.includes('ask') || lower.includes('price') || lower.includes('charge'))) {
  return `Great question! 💰\n\nHere's what similar items sell for:\n• Designer suits: $80-200\n• Kurtas: $40-100\n• Lehngas: $150-400\n\nWe take 18%, so if you price at $100, you get $82.\n\nWhat price feels right for your piece?`;
}
```

### C. Rewrite Key Messages (messages.js)

**SELL_START:**
```
"Let's list your item! 💛

Just tell me:
• Brand (Khaadi, Maria B, etc)
• What is it (kurta, suit, lehnga)
• Size
• Condition (new, like new, gently used)
• Your asking price

Example: 'Maria B kurta, M, like new, $80'

Or send a voice note - I'll figure it out! 🎤"
```

**SELL_EXTRACTED (after getting info):**
```
"Perfect! Here's what I got:

• [brand] [item_type]
• Size [size] • [condition]
• $[price] (you'll get ~$[payout])

[If missing fields]: Still need: [missing]
[If all complete]: Now send me 3+ photos! 📸"
```

**SELL_ASK_DETAILS:**
```
"Almost done! 💛

Any details to add? Color, fabric, embroidery, flaws?

• Type them out, OR
• Reply SKIP (I'll use what I can see in photos)"
```

**SELL_ASK_LINK:**
```
"Last thing! Do you have a link to the original listing? (designer website, Instagram, etc)

This helps verify authenticity!

• Paste the link, OR
• Reply SKIP if you don't have one"
```

### D. Brand Celebration (sell.js)
When extracting brand, add celebration:
```javascript
const brandCelebrations = {
  'maria b': 'Ooh Maria B! 😍',
  'sana safinaz': 'Love Sana Safinaz! ✨',
  'khaadi': 'Khaadi is always popular! 👍',
  'elan': 'Elan pieces are gorgeous! 💛',
  'agha noor': 'Agha Noor - beautiful choice!',
  // etc
};
```

### E. Confirmation Pattern (sell.js)
After EVERY extraction, echo back:
```
"Got it! [what we understood]

[Next step with clear instruction]"
```

---

## Success Criteria
- Aunty Approval Rate > 60%
- Every response confirms what was understood
- Every response has ONE clear next step
- Interruptions handled gracefully
- Brand celebration on recognition
- Price guidance available
