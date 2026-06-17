# Phirstory Feature Spec
_Last updated: 2026-05-29_

---

## Priority 1 — Ownership Refactor
> Status: Scoped, not started

Kill `sellers.shopify_product_ids` array. Single `setProductOwnership(productId, sellerEmail)` service in `lib/listing-ownership.js`. All writes route through it. Metafields remain source of truth. Full Shopify + Supabase backup before migration.

See MEMORY.md for full phase breakdown (Phase 0–6).

---

## Priority 2 — Payment / Payout Flow Fixes

### 2a. Hide sale price from sold notification
> Status: Bug, not started

When an item sells, the automated WhatsApp/email to the seller must NOT include the sale price. Small targeted fix in the order webhook notification logic.

### 2b. Payout receipt flow
> Status: Not started

Before admin pays out a seller, they must compose a breakdown message. This is sent as a **pre-approved WhatsApp utility template** (must be Meta-approved before build).

Template variables needed:
- Seller name
- Item name / Shopify product title
- Sale price
- Commission amount + rate
- Net payout to seller
- Any deductions (e.g. shipping reimbursement)

Flow:
1. Admin clicks "Initiate Payout" on a transaction
2. Modal opens with pre-filled receipt fields (editable)
3. Admin reviews, clicks "Send Receipt & Pay Out"
4. WhatsApp utility template fires to seller with breakdown
5. Payout marked as sent in dashboard

**Action needed before build:** submit utility template to Meta for approval.

---

## Priority 3 — WhatsApp Messaging Dashboard
> Status: Not started

Two-way WhatsApp inbox inside admin dashboard for messages that don't match a known webhook task.

### What it handles
- Inbound messages with no matching task (e.g. seller replies to automated message, buyer reaches out cold)
- Admin replies within the 24-hour WhatsApp service window
- Admin-initiated outreach using approved templates (cold or window-expired contacts)

### WhatsApp API rules (critical constraints)
- **Within 24hr window:** free-form replies allowed after any inbound message
- **Outside 24hr window / cold contact:** must use a pre-approved template to initiate
- **Template categories:** marketing, utility, authentication (each has different approval criteria and cost)

### Dashboard features
- Conversation thread view per contact (linked to seller/buyer profile where known; "unknown contact" otherwise)
- Unread badge / notification indicator
- When window is open: free-form reply box
- When window is expired or contact is cold: template picker dropdown with variable fields (name, item, etc.)
- Warning shown when 24hr window is about to expire (e.g. < 2hrs remaining)
- Template library management (admin can see all approved templates, variables, category)

### Template library (to be approved with Meta)
Templates needed at minimum:
- Payout receipt (utility) — see 2b
- "Following up on your listing" (utility or marketing)
- "Your item has received an offer" (utility)
- Delivery confirmation request (utility) — see Priority 6
- General re-engagement / welcome back (marketing)

**Action needed before build:** audit existing approved templates, identify gaps, submit new ones to Meta.

---

## Priority 4 — Shipping Label Tracking (Easyship → Dashboard + Shopify)
> Status: Partially built (webhook believed added but not working), needs investigation

When a label is purchased via Easyship:
1. Tracking number + carrier recorded in `transactions` table in dashboard
2. Shopify order updated with tracking info via Shopify API
3. Shopify fires "shipment dispatched" notification to buyer with tracking link (standard Shopify fulfillment notification)
4. Dashboard transaction card shows shipping status + tracking link

**Investigation needed:** find the Easyship webhook handler, determine why tracking isn't being recorded. Check Easyship dashboard for webhook delivery logs.

---

## Priority 5 — Transactions Dashboard Redesign
> Status: Not started

Current UI is cluttered and hard to scan. Full layout/UX redesign needed.

Goals:
- Clear status chips: `Pending Label`, `Label Bought`, `Shipped`, `Delivered`, `Payout Pending`, `Paid Out`, `Concierge`
- Most actionable items surfaced at top (e.g. "awaiting payout", "label not yet purchased")
- Filterable by status, seller, date range
- Each card shows: item thumbnail, seller name, buyer name, sale price, net payout, shipping status, tracking link
- Payout action accessible directly from card

---

## Priority 6 — Buyer Delivery Confirmation + Review Request
> Status: Not started

When a buyer receives their item, send an automated WhatsApp message or email asking them to confirm receipt and leave a review.

Flow:
1. Trigger: Shopify "delivered" event (via Easyship/Shopify tracking update) OR manual admin trigger as fallback
2. Message sent to buyer via WhatsApp (utility template, pre-approved) or email
3. Message asks:
   - Did you receive the item? (Yes / Issue)
   - Leave a review for the seller
4. On buyer confirmation → transaction marked "Delivered + Confirmed"
5. Admin can now initiate payout to seller (payout blocked until confirmation or manual override)
6. Reviews stored, visible on seller profiles in dashboard

**Dependency:** relies on Priority 4 (tracking) for automatic trigger. Manual fallback needed regardless.

**Action needed before build:** write and submit delivery confirmation WhatsApp template to Meta.

---

## Priority 7 — Offers / Bidding System
> Status: Speccing, not started

Buyers place offers on Shopify listings. Sellers respond via WhatsApp. 

### Flow (draft)
1. "Make an Offer" button on Shopify product page → form → offer stored (Supabase `offers` table)
2. Seller notified via WhatsApp (utility template): item name, buyer offer amount, expiry
3. Seller replies with: Accept / Decline / Counter amount
4. If **accept**: Shopify draft order or price rule generated at offer price, unique link sent to buyer
5. If **counter**: buyer notified via WhatsApp/email with counter offer, can accept/decline
6. If **decline** or **expires**: offer closed, no action
7. All offer history visible in admin dashboard

### Open questions (discuss with cofounder)
- How to handle concurrent offers on the same item?
- Offer expiry window (24hr? 48hr?)
- Does seller counter via structured WhatsApp reply or dashboard?
- Do we notify buyer via WhatsApp (needs opt-in / template) or email?
- Commission on offers: same rate as list price or different?
- Can buyer make offer below a floor price? Admin-set floor?

**Action needed before build:** answer open questions, write WhatsApp templates for offer notification + counter flow, submit to Meta.

---

## Cross-cutting: WhatsApp Template Approval Checklist

| Template | Category | Needed for | Status |
|---|---|---|---|
| Payout receipt | Utility | Priority 2b | ❌ Not submitted |
| Delivery confirmation | Utility | Priority 6 | ❌ Not submitted |
| Offer notification to seller | Utility | Priority 7 | ❌ Not submitted |
| Offer counter to buyer | Utility | Priority 7 | ❌ Not submitted |
| Re-engagement / follow-up | Marketing | Priority 3 | ❌ Not submitted |

Submit all utility templates before starting those features — approval takes 1–3 days.
