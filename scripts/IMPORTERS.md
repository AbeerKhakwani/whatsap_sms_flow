# Seller / product importers — which one to use

Ownership lives in three places that must agree: **Shopify metafields `seller.id` / `seller.email` (source of truth)**, the `sellers.shopify_product_ids` array (mirror), and the `listings` table (mirror). An importer that writes the array but **not** the metafields causes silent drift — that's what produced the "Annie owns 406 of 460 products" bug (Jun 2026).

| Script | Writes metafields? | Status |
|---|---|---|
| **`import-sellers-sync.js`** | ✅ array **+** metafields | **CANONICAL — use this.** Generic CSV (`email, phone, shopify_product_ids`). `--dry-run` supported. |
| `import-sellers-v2.js` | ✅ array + metafields | Deprecated. Circle-Hand-specific CSV. Superseded by `-sync`. |
| `import-sellers.js` | ❌ array only | **DEPRECATED & UNSAFE — guarded so it won't run.** Caused the drift bug. |

## Rules going forward
- New imports go through `import-sellers-sync.js` (or, better, the app's `setProductOwnership` service in `lib/listing-ownership.js`, which writes all three sources at once).
- After any bulk import, run **Scripts → Reconcile Ownership (Dry Run)** to confirm zero drift.
- The nightly `ownership-drift` cron (`lib/cron/ownership-drift.js`) alerts Slack if any seller's array ever disagrees with metafields.
