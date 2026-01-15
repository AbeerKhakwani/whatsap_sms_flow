# Admin Dashboard Testing Checklist

Complete testing guide for all new features deployed.

---

## 🎯 Pre-Testing Setup

### Check Environment
- [ ] Admin dashboard accessible at: `https://your-domain.com/admin`
- [ ] Login credentials working
- [ ] Production Shopify credentials in environment variables
- [ ] Email (Resend) API key configured
- [ ] WhatsApp credentials configured
- [ ] Supabase connection working

### Test Data Needed
- [ ] At least 2 test listings in "pending-approval" state
- [ ] 1 test seller with email + phone
- [ ] Access to test email inbox
- [ ] Access to test WhatsApp number

---

## 📋 Feature 1: Rejection with Reason

### Test Rejection Flow
- [ ] **Open Dashboard**
  - Go to `/admin/dashboard`
  - Verify pending listings show up
  - Click on a listing to expand

- [ ] **Open Reject Modal**
  - Click "Reject" button
  - Verify modal opens with:
    - Alert icon (red)
    - Product name displayed
    - Dropdown with 8 reasons
    - Optional note textarea
    - Info banner about notifications
    - Cancel button
    - "Reject & Notify" button

- [ ] **Test Validation**
  - Try clicking "Reject & Notify" without selecting reason
  - Should show alert: "Please select a rejection reason"

- [ ] **Submit Rejection**
  - Select reason: "Poor Photo Quality"
  - Add note: "Please retake photos with better lighting"
  - Click "Reject & Notify"
  - Verify:
    - Button shows "Rejecting..." with spinner
    - Modal closes after success
    - Listing removed from pending list
    - Stats update (pending count -1)

### Test Notifications
- [ ] **Check Email**
  - Open seller's email inbox
  - Verify email received with:
    - Subject: "Update on your listing - The Phir Story"
    - Red banner with rejection reason
    - Custom note included
    - "Submit New Listing" button
    - Professional, friendly tone

- [ ] **Check WhatsApp**
  - Open seller's WhatsApp
  - Verify message received with:
    - Seller name (if available)
    - Product title
    - Rejection reason
    - Custom note
    - Encouraging message to resubmit

- [ ] **Check Shopify**
  - Open Shopify Admin → Products
  - Verify product was deleted (not just drafted)

- [ ] **Check Database Logs**
  - Query `messages` table in Supabase
  - Verify rejection logged for seller
  - Should have both email and WhatsApp entries

### Edge Cases
- [ ] Reject listing without seller info (orphaned listing)
- [ ] Reject with only reason, no note
- [ ] Reject with very long note (500+ characters)
- [ ] Try rejecting while another listing is being rejected

**✅ Result:**
- Rejection reason: _____________
- Email received: Yes / No
- WhatsApp received: Yes / No
- Product deleted from Shopify: Yes / No

---

## ✅ Feature 2: Approval Modal with Editable Fields

### Test Approval Flow
- [ ] **Open Approval Modal**
  - Expand a pending listing
  - Click "Review & Approve" button
  - Verify modal opens with:
    - Green check icon
    - Product name displayed
    - Description textarea (pre-filled)
    - Tags input (pre-filled, comma-separated)
    - Commission rate input (pre-filled with current rate)
    - Live calculation showing seller %
    - Info banner about what happens
    - Cancel and "Approve & Make Live" buttons

- [ ] **Test Pre-filled Values**
  - Verify description matches listing
  - Verify tags match current tags
  - Verify commission shows correct rate (default 18%)

- [ ] **Edit Description**
  - Clear description field
  - Type: "Beautiful Sana Safinaz lawn suit in excellent condition. Perfect for summer!"
  - Verify textarea expands/scrolls as needed

- [ ] **Edit Tags**
  - Modify tags: "Sana Safinaz, Lawn, Medium, Excellent, New Arrivals"
  - Test with extra spaces, trailing commas
  - Test with empty tag field

- [ ] **Edit Commission**
  - Change commission from 18% to 15%
  - Verify live calculation updates: "Seller receives 85% of asking price"
  - Try 0% commission (seller gets 100%)
  - Try 100% commission (seller gets 0%)
  - Try invalid values (negative, over 100)

### Test Approval Process
- [ ] **Submit Approval**
  - Edit all fields (description, tags, commission)
  - Click "Approve & Make Live"
  - Verify:
    - Button shows "Approving..." with spinner
    - No errors in console
    - Modal closes after success
    - Listing removed from pending list
    - Stats update (pending -1, approved +1)

### Verify Changes in Shopify
- [ ] **Check Product in Shopify**
  - Open Shopify Admin → Products
  - Find the approved product
  - Verify:
    - Status: Active (not draft)
    - Description: Updated text from modal
    - Tags: Contains your edits + "New Arrivals" + gender tag
    - Commission metafield: Shows new rate
    - Seller payout metafield: Recalculated based on new commission
    - Inventory cost: Updated to match new payout

- [ ] **Check Metafields**
  - In Shopify product page, scroll to Metafields section
  - Verify structured metafields (if definitions created):
    - Seller Email (pinned)
    - Seller Phone (pinned)
    - Commission Rate (pinned) - should show new value
    - Seller Payout (pinned) - should show recalculated amount
    - Seller Asking Price (pinned)

### Test Notifications
- [ ] **Check Email**
  - Verify seller received approval email with:
    - Subject: "Your listing is live!"
    - Green success banner
    - Product title
    - "View Your Listing" button
    - **Correct payout amount** (based on new commission)

- [ ] **Check WhatsApp**
  - Verify WhatsApp message with:
    - Approval confirmation
    - Product title
    - Correct payout amount

### Edge Cases
- [ ] Approve with empty description
- [ ] Approve with no tags
- [ ] Approve with commission = 0
- [ ] Approve with commission = 100
- [ ] Cancel modal and verify no changes
- [ ] Edit and cancel, then re-open - should show original values

**✅ Result:**
- Description updated: Yes / No
- Tags updated: Yes / No
- Commission changed from ___ to ___
- Payout recalculated correctly: Yes / No
- Email sent with correct payout: Yes / No

---

## 👤 Feature 3: Seller Info Display

### Test Seller Information
- [ ] **Expand Listing**
  - Click to expand any pending listing
  - Verify "Seller" section appears at top

- [ ] **Check Seller Card**
  - Verify displays:
    - Seller name (or "Unknown" if missing)
    - Seller email
    - Seller phone (if not NOPHONE or RESET_)
    - "Payout if sold" label
    - Payout amount in green ($XX.XX)

- [ ] **Test with Different Sellers**
  - Listing with full seller info (name, email, phone)
  - Listing with email only (no name/phone)
  - Listing with no seller info (orphaned)

- [ ] **Verify Payout Calculation**
  - Check payout amount matches:
    - (Asking Price - $10) × (100 - Commission%) / 100
  - Example: $100 asking, 18% commission
    - Should show: ($100 - $10) × 0.82 = $73.80

**✅ Result:**
- Seller info displays correctly: Yes / No
- Payout calculation accurate: Yes / No
- Missing data handled gracefully: Yes / No

---

## 🖥️ Feature 4: Scripts Page

### Test Scripts Page Access
- [ ] **Navigate to Scripts**
  - Click "Scripts" in sidebar (terminal icon)
  - Verify page loads with:
    - "Admin Scripts" header
    - Blue info banner about production credentials
    - "Metafield Migration" section
    - 2 script cards
    - Instructions panel at bottom

### Test Create Metafield Definitions
- [ ] **Run Script**
  - Click "Run" on "Create Metafield Definitions"
  - Verify:
    - Button changes to "Running" with spinner
    - Other scripts disabled while running
    - Blue "Running script..." message appears
    - Takes ~30 seconds

- [ ] **Check Results**
  - After completion, verify:
    - Green success banner appears
    - Summary shows:
      - Created: X
      - Already existed: Y
      - Errors: 0
      - Total: 6
    - Output log shows each field created
    - Duration displayed

- [ ] **Verify in Shopify**
  - Open Shopify Admin → Settings → Custom data → Products
  - Verify 6 metafield definitions exist:
    - Seller Email (pinned)
    - Seller Phone (pinned)
    - Seller ID
    - Commission Rate (pinned)
    - Seller Asking Price (pinned)
    - Seller Payout (pinned)

### Test Backfill Metafields
- [ ] **Run Script**
  - Click "Run" on "Backfill Metafields"
  - Verify:
    - Button shows "Running" with spinner
    - Blue "Running script..." message
    - Progress updates appear
    - Takes 2-5 minutes depending on product count

- [ ] **Check Output**
  - Verify output shows:
    - "Fetching all products..."
    - "Found X products"
    - Progress for each product: [1/X] Product Name - Updated Y fields
    - Some products show "No changes needed" (already migrated)
    - Summary at end:
      - Total products: X
      - Products updated: Y
      - Total fields migrated: Z

- [ ] **Verify in Shopify**
  - Open any product
  - Scroll to Metafields section
  - Verify structured metafields now populated with data
  - Check money values show as "$XX.XX USD"

### Edge Cases
- [ ] Run create definitions twice (should show "Already existed")
- [ ] Run backfill twice (should show "No changes needed")
- [ ] Check error handling if Shopify API fails
- [ ] Verify rate limiting (shouldn't hit API limits)

**✅ Result:**
- Definitions created: Yes / No
- Products backfilled: ___ / ___
- Metafields visible in Shopify: Yes / No
- No errors encountered: Yes / No

---

## 🏷️ Feature 5: Auto-Tags on Approval

### Test Tag Generation
- [ ] **Test Women's Items**
  - Create/approve listing with: "Sana Safinaz Lawn Suit"
  - Verify tags include:
    - "New Arrivals" (added first)
    - "Women" (auto-detected)
    - Original tags preserved
    - "pending-approval" removed
    - "preloved" removed

- [ ] **Test Men's Items**
  - Create/approve listing with: "Sherwani"
  - Verify tags include:
    - "New Arrivals"
    - "Men" (auto-detected)

- [ ] **Test Ambiguous Items**
  - Create listing without gender keywords
  - Verify:
    - "New Arrivals" added
    - No gender tag (not assumed)

- [ ] **Verify Tag Order**
  - Check approved product in Shopify
  - Verify "New Arrivals" is first tag
  - Gender tags appear near end
  - Original tags in between

**✅ Result:**
- "New Arrivals" tag added: Yes / No
- Gender auto-detected correctly: Yes / No
- Old tags cleaned up: Yes / No

---

## 🔄 Integration Tests

### Test Complete Approval Flow
- [ ] Create new listing via WhatsApp/Portal
- [ ] Wait for it to appear in pending
- [ ] Expand listing and verify all info displays
- [ ] Click "Review & Approve"
- [ ] Edit description, tags, and commission
- [ ] Approve and verify:
  - Product goes live in Shopify
  - Seller receives email + WhatsApp
  - Metafields updated correctly
  - Payout calculated with new commission
  - Tags include "New Arrivals"

### Test Complete Rejection Flow
- [ ] Create new listing
- [ ] Reject with reason and note
- [ ] Verify:
  - Product deleted from Shopify
  - Seller receives email + WhatsApp
  - Notifications logged in database
  - Listing removed from dashboard

### Test Edge Cases
- [ ] Approve listing without seller info
- [ ] Reject listing without seller info
- [ ] Try to approve listing twice (race condition)
- [ ] Approve with network interruption
- [ ] Check console for errors during all operations

---

## 📊 Final Verification

### Dashboard State
- [ ] Pending count accurate
- [ ] Approved count accurate
- [ ] Sold count accurate
- [ ] No orphaned UI states
- [ ] All modals close properly

### Shopify State
- [ ] All approved products are Active
- [ ] All rejected products are deleted
- [ ] No draft products with wrong tags
- [ ] Metafields populated correctly

### Database State
- [ ] Check `messages` table - all notifications logged
- [ ] Check `sellers` table - phone numbers updated
- [ ] Check `transactions` table - no corruption

### Notifications
- [ ] All emails received within 1 minute
- [ ] All WhatsApp messages received
- [ ] Content accurate and professional
- [ ] No duplicate notifications

---

## 🐛 Bug Tracking

Use this section to track any issues found:

### Issue 1
- **Feature:** _______________
- **Steps to reproduce:** _______________
- **Expected:** _______________
- **Actual:** _______________
- **Severity:** Critical / High / Medium / Low
- **Screenshot:** _______________

### Issue 2
- **Feature:** _______________
- **Steps to reproduce:** _______________
- **Expected:** _______________
- **Actual:** _______________
- **Severity:** Critical / High / Medium / Low

---

## ✅ Sign-off

- [ ] All critical features tested
- [ ] No critical bugs found
- [ ] Edge cases handled gracefully
- [ ] Notifications working correctly
- [ ] Shopify integration verified
- [ ] Ready for production use

**Tested by:** _______________
**Date:** _______________
**Overall Status:** ✅ Pass / ⚠️ Pass with issues / ❌ Fail

**Notes:**
_______________________________________________
_______________________________________________
_______________________________________________
