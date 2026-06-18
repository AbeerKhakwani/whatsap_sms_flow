# Ownership — items to resolve manually (2026-06-18)

These 16 active products have **no owner in Shopify metafields** and could **not** be confidently
matched to your Notion Sellers ledger. The other 21 active orphans were assigned automatically from
Notion. Assign these via the dashboard (set the seller on the listing → writes the metafield), or
hand the list back with owners filled in and I'll write them.

> Open any item in Shopify admin: `/admin/products/<productId>`

## A) Duplicate generic titles — Notion shows Mahrukh owns ONE of each, but Shopify has more
Pick which physical item is Mahrukh's; decide the rest (likely the sample batch in section B).

| Product ID | Title | Note |
|---|---|---|
| 8802732474663 | Kurta - Sana Safinaz | 3 exist; Mahrukh owns 1 per Notion |
| 8803803365671 | Kurta - Sana Safinaz | " |
| 8905617146151 | Kurta - Sana Safinaz | " |
| 8803833970983 | Kurta - Sapphire | 2 exist; Mahrukh owns 1 per Notion |
| 8803866640679 | Kurta - Sapphire | " |

## B) Not in Notion at all — your call (these look like an old sample/seed batch: sequential IDs, generic titles)
| Product ID | Title | Hint |
|---|---|---|
| 8803751723303 | Kurta - Nishat Pret | nskhan9393 has a "Jacket - Nishat Pret" |
| 8803774431527 | 3 piece - Asifa & Nabeel | — |
| 8803819913511 | Kurta - Khaadi | — |
| 8803848290599 | Kurta - Khaadi | — |
| 8803888267559 | Kurta - Aisha Imran | Mahrukh has a "Watermelon - Aisha Imran" |
| 9724982657319 | Deepak Perwani | — |
| 9724986163495 | Goal Blue and grey | — |
| 9725012279591 | White Perfect Dreams - Farah Talib Aziz | mredrose owns other Farah Talib Aziz items |
| 9725022175527 | Ayesha Osman Qamar | — |
| 10052109795623 | Zainab Zulfiqar - Kaftan | — |

## C) Junk — delete, do not assign
| Product ID | Title | Action |
|---|---|---|
| 10216709751079 | Dry Cleaning Before Shipping | Delete / archive |

---
After these are assigned (metafields written), run **Scripts → Reconcile Ownership → Apply** to lock
every seller's list to the metafields. The nightly drift check will keep it honest going forward.
