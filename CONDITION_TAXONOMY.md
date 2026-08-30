# Condition Taxonomy

**Status:** migration APPLIED to the store (229 products, then 118 more on the `Excellent`→`Very Good` rename). Code changes still uncommitted.
**Date:** 30 Aug 2026
**Latest snapshot for rollback:** `backups/condition-snapshot-2026-08-30170032.json`

## The five values

There are exactly five, ordered best → worst. Nothing else is allowed to exist.

| Value | Means |
|---|---|
| `NWT` | New with tags |
| `NWOT` | New without tags |
| `Like New` | No signs of wear |
| `Very Good` | Worn but sound — absorbs the old `Good` and `Excellent` |
| `Fair` | Real, disclosed flaws |

Defined once in **[`lib/conditions.js`](lib/conditions.js)**. Every dropdown, every Shopify
write, and the migration script import from there. Add a value there or nowhere.

## What went wrong

Condition lives on **three** Shopify surfaces, and each one drifted independently:

| Surface | Written at creation | Written on admin edit |
|---|---|---|
| `Condition` product option (drives the storefront filter) | ✅ | ✅ |
| `custom.condition` metafield | ✅ | ✅ |
| condition **tag** | ✅ | ❌ **never** |

The tag was set once from the seller's original wording and then never touched again.
Change `Good` → `Very Good` in the approvals editor and the product kept its `Good` tag
forever. That is the whole drift mechanism.

Compounding it, the same five-item list was **copy-pasted into eight files** and two of
them had diverged — `SellerDashboard.jsx` offered `Gently used` / `Used`, values no other
screen could produce. And `Very Good`, the store's second most common value, was in no
dropdown at all: it arrived via the `ch-import` and could not be re-selected by hand.

Result: 14 distinct option values, 11 distinct tags, ~90 distinct metafield strings.

## Merge decisions

- `Good`, `Excellent`, `Gently used` → **`Very Good`**. One "worn but sound" tier.
  Named `Very Good` and not `Excellent` deliberately: "Excellent" reads as *better* than
  "Like New", which inverts the ranking. `Very Good` sits below it the way people expect.
- `Brand New` → **`NWT`** (the single product had an `NWT` metafield and a `New with tags` tag).
- `Used`, `Poor` → **`Fair`**.
- An item previously marked `Like New` whose metafield reads `"Very Good - minimal signs of
  wear"` moves **down** to `Very Good`. This is deliberate: the metafield is the more
  considered description.

## Metafields are NOT touched

`custom.condition` is free text carrying seller flaw disclosures:

> `"Very Good - one tiny hole (unnoticeable) in front, likely due to an ornament falling off. Please see picture"`

Flattening that to `Excellent` would delete ~60 real disclosures buyers rely on. So the
metafield is **read to decide the grade and then left completely alone** — no migration
writes it, and `action=update` still saves whatever the admin types. Clean it by hand in
Shopify admin whenever you want; nothing depends on its format.

## Conflict resolution

When the three surfaces disagree (35 products), precedence is:

```
metafield  →  option value  →  tag  →  leave alone and report
```

The metafield wins because it is the most considered and most detailed. Review the calls
before applying with `--conflicts`.

## Running the migration

```bash
node scripts/normalize-condition.mjs                    # dry-run + snapshot, no writes
node scripts/normalize-condition.mjs --conflicts        # review the 35 disagreements
node scripts/normalize-condition.mjs --apply --limit=5  # test batch
node scripts/normalize-condition.mjs --apply            # full apply
```

Every run snapshots all 424 products to `backups/condition-snapshot-<stamp>.json` **before**
writing. To undo:

```bash
node scripts/rollback-condition.mjs --from=backups/condition-snapshot-<stamp>.json --apply
```

The script covers **all statuses** including archived, so unarchiving something later can't
resurrect an old value.

## Known gaps — need a human

- **36 garments have no `Condition` option at all.** The script renames existing options; it
  does not create them. Creating one changes variant structure, so it was left out
  deliberately. 21 are archived, 7 active, 8 draft.
- **`ZIVA - Faiza Saqlain`** has two option values (`NWT`, `Default Title`). Renaming both
  would collide, so it is skipped.
- **5 products are correctly skipped as non-garments:** `TPS Gift Card`, `TPS Tote`, and the
  three `Dry Cleaning` services. The `NON_GARMENT` regex in the script guards these — extend
  it if you add more service products.

## Code changes

- **New:** `lib/conditions.js` (source of truth), `tests/unit/conditions.test.js` (10 tests)
- **`api/admin-listings.js`** — `action=update` now rewrites the condition **tag** to match
  the option. This is the fix that stops re-drift. Also retired a local map that did
  `'very good' → 'Excellent'` in its own ad-hoc way.
- **`lib/shopify.js`** — `createDraft` canonicalises before writing option + tag; metafield
  still stores the seller's raw wording.
- **8 dropdowns** now read `CONDITIONS` / `CONDITION_LABELS`: `ReviewQueue` (×2),
  `Dashboard`, `ListingDetail`, `ShopPage`, `SellerSubmit`, `SellerProfile`, `SellerDashboard`.
- **Keyword matcher fixed** in `SellerSubmit.jsx` and `api/sms-webhook.js` — it was
  first-match-wins, so `"brand new without tags"` matched NWT's short `brand new` keyword
  before NWOT was ever tested. Now longest-keyword-first.
- **AI prompts** in `lib/ai-extract.js` and `api/validate-listing.js` teach the new vocabulary.

## Amendment — 30 Aug 2026, second pass

The tier first shipped as `Excellent`. That was wrong: `Excellent` reads as *better* than
`Like New`, so the five values did not rank in an order anyone could guess. Renamed to
`Very Good` and re-applied across 118 products (a pure rename — zero surface conflicts,
since the first migration had already made all three surfaces agree).

Also split out a distinct `condition_option` gap. Seven active products have no Condition
option at all, and the API cannot set `option3` on a product that lacks the option — the
cleanup deck now links those out to Shopify instead of showing a dropdown that silently
does nothing:

    Pure Grip Saree · Purple ZC-2020 - Zara Shahjahan · Deepak Perwani
    Suffuse mustard green · Goal Blue and grey · Ayesha Osman Qamar
    Libaas-e-Khaas Red and gold

Four stale condition tags survive, all on products in that skipped set:
`New with tags` ×1, `New without tags` ×2, `Excellent` ×1. They clear once each product
gets a Condition option.
