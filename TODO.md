# Phirstory Dashboard - Dev Notes

**Last Updated:** January 26, 2025

## Current State

### What Was Built: Order Lifecycle & Payout System

**1. `api/seller.js` (Staged)**
- Full order lifecycle management with payout status tracking
- On-demand shipping labels (no pre-generation to avoid unused label costs)
- Balance breakdown by status: `pending_shipping` → `in_transit` → `delivered` → `available` → `paid`
- Shopify order fulfillment when labels are created (buyer gets tracking)
- Seller notifications via WhatsApp + email on sale

**2. `lib/shipping.js` (Unstaged)**
- Easyship integration with sandbox/production auto-detection
- Ships seller → buyer (not to warehouse)
- Fallback chain: Easyship → EasyPost → Manual instructions

**3. `lib/email.js` (Unstaged)**
- New lifecycle emails: `sendItemSold`, `sendShippingReminder`, `sendItemDelivered`, `sendPayoutAvailable`

**4. `src/pages/seller/SellerProfile.jsx` (Unstaged)**
- "My Sales" tab with shipping label actions
- "My Balance" tab showing balance breakdown by payout status
- Hides shipping button for already-fulfilled orders

---

## Bug to Fix

**File:** `api/seller.js:732`

```js
results.push({ sellerId: seller.id, productId, payout: sellerPayout, hasLabel: !!labelResult?.labelUrl });
```

`labelResult` is undefined - it was removed when switching to on-demand labels but this reference remains. Either remove `hasLabel` from the results or set it to `false`.

---

## Git Status (as of Jan 26)

**Staged:**
- `api/seller.js`

**Unstaged:**
- `lib/email.js`
- `lib/shipping.js`
- `src/pages/seller/SellerProfile.jsx`

**Untracked:**
- `scripts/test-easyship.js`
- `scripts/test-easyship-v2.js`

---

## What's Next (Priority Order)

1. **Fix bug** - Remove undefined `labelResult` reference in `api/seller.js:732`
2. **Commit** - Stage and commit the unstaged changes
3. **Test** - Test Easyship integration with real/sandbox API
4. **Tracking webhook** - Implement webhook to auto-update `payout_status` when package delivered
5. **Payout automation** - Auto-transition `delivered` → `available` after 3-day contest window
6. **Reminders cron** - Send shipping reminder emails for overdue items

---

## Recent Commits (for context)

- `af8834c` feat: implement order lifecycle and payout system
- `d69ed20` debug: add detailed Easyship API logging
- `2588c52` fix: hide shipping label button for fulfilled orders
- `96dab0e` feat: add Shopify fallback for buyer address in shipping labels
- `a6d46f1` feat: support Easyship sandbox mode for testing
