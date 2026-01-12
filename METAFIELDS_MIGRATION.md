# Metafields Migration Guide

This guide explains how to migrate unstructured metafields to structured definitions in Shopify.

## What This Does

Moves seller and pricing data from "Unstructured metafields" into structured, pinned metafields that show prominently in the Shopify Admin product page.

**Before:** Data hidden in unstructured JSON blobs
**After:** Clean, typed fields visible at top of product page:
- 📌 Seller Email
- 📌 Seller Phone
- 📌 Commission Rate
- 📌 Seller Asking Price ($)
- 📌 Seller Payout ($)

## Steps to Migrate

### Phase 1: Create Metafield Definitions (One-time)

This creates the structured field definitions in Shopify:

```bash
node scripts/create-metafield-definitions.js
```

**What it does:**
- Creates 6 metafield definitions via Shopify GraphQL API
- Sets proper types (text, phone, number, money)
- Pins important fields to show at top of product page
- Safe to run multiple times (skips existing definitions)

**Expected output:**
```
Creating: seller.email (single_line_text_field)
✅ Created: seller.email (ID: gid://shopify/...)
   📌 Pinned at position 1

Creating: pricing.seller_payout (money)
✅ Created: pricing.seller_payout (ID: gid://shopify/...)
   📌 Pinned at position 5
```

### Phase 2: Update Code (Already done!)

✅ `lib/shopify.js` - Now writes structured metafields with proper types
✅ `lib/metafield-helpers.js` - Helpers to read both old and new formats
✅ `api/admin-listings.js` - Uses helpers to read metafields correctly

**All new listings will automatically use structured metafields.**

### Phase 3: Backfill Existing Products

Migrate existing products from unstructured → structured:

```bash
node scripts/backfill-metafields.js
```

**What it does:**
- Fetches all products from Shopify
- For each product, checks if it has unstructured seller/pricing data
- Copies values to structured fields (only if structured field is empty)
- Properly formats money values as `{"amount": "123.45", "currency_code": "USD"}`
- Rate-limited to avoid API throttling
- Shows progress and summary

**Expected output:**
```
📦 Fetching all products...
✅ Found 47 products

✅ [1/47] Sana Safinaz - Lawn Suit - Updated 6 fields
⏭️  [2/47] Maria B - Designer Dress - No changes needed
✅ [3/47] Khaadi - Unstitched Suit - Updated 5 fields

📊 Summary:
   Total products: 47
   Products updated: 32
   Total fields migrated: 184

✅ Backfill complete!
```

**Safety features:**
- Only overwrites if structured field is empty (won't clobber manual edits)
- Skips invalid/malformed values
- Keeps unstructured fields intact (doesn't delete)
- Can be run multiple times safely

### Phase 4: Verify in Shopify Admin

1. Go to Shopify Admin → Products
2. Open any product
3. Scroll to **Metafields** section
4. You should see pinned fields at the top:
   - ✅ Seller Email
   - ✅ Seller Phone
   - ✅ Commission Rate (18)
   - ✅ Seller Asking Price ($100.00 USD)
   - ✅ Seller Payout ($82.00 USD)

### Phase 5: Cleanup (Optional)

Once verified everything works:

1. Unstructured fields can be ignored (they're harmless)
2. Optionally remove old unstructured keys if you want (not required)
3. The system now reads from structured fields with fallback to unstructured

## Files Changed

### New Files
- `scripts/create-metafield-definitions.js` - Creates definitions
- `scripts/backfill-metafields.js` - Migrates existing products
- `lib/metafield-helpers.js` - Smart helpers to read metafields
- `METAFIELDS_MIGRATION.md` - This guide

### Modified Files
- `lib/shopify.js` - Now writes structured metafields (money type)
- `api/admin-listings.js` - Uses helper functions

## Troubleshooting

### "Already exists" errors
✅ Normal! Means the definition was already created. Script handles this gracefully.

### "Invalid money format" errors
Check that values are valid numbers. The script will skip invalid values and log them.

### No fields showing in Admin
1. Make sure Phase 1 completed successfully
2. Check that Phase 3 updated the products
3. Refresh Shopify Admin page

### Rate limiting errors
The scripts include delays (500ms between requests). If you hit limits, increase `DELAY_MS` in the backfill script.

## What Gets Migrated

| Namespace | Key | Type | Pinned | Notes |
|-----------|-----|------|--------|-------|
| seller | email | text | ✅ | Seller email address |
| seller | phone | text | ✅ | Seller phone number |
| seller | id | text | - | Seller UUID (for internal use) |
| pricing | commission_rate | number | ✅ | e.g., 18 for 18% |
| pricing | seller_asking_price | money | ✅ | Original amount seller asked |
| pricing | seller_payout | money | ✅ | Amount seller receives |

## Benefits

✅ **Better UX:** Seller/pricing info visible at a glance
✅ **Type Safety:** Money fields show currency, numbers are validated
✅ **Pinned Fields:** Important data at top of product page
✅ **Searchable:** Can filter/search products by these fields
✅ **Future-Proof:** Structured data works better with Shopify apps

## Need Help?

- Check Shopify Admin → Settings → Custom data → Products to see definitions
- Run scripts with `NODE_ENV=development` for more verbose logging
- Check logs for "⚠️" warnings about skipped fields
