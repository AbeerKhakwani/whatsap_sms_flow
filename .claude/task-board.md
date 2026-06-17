# Phirstory Task Board
_Last updated: 2026-06-11_

Legend: 🔴 Blocked | 🟡 Ready | 🟢 In Progress | ✅ Done | ⏸ On Hold

---

## 🟢 In Progress

| Task | Branch | Notes |
|---|---|---|
| _(nothing in progress)_ | | |

---

## 🟡 Ready to Start

| # | Task | Effort | Spec |
|---|---|---|---|
| 1 | Ownership refactor — Phase 0: backups | 1hr | feature-spec.md #1 |
| 2a | Hide sale price from sold notification | 30min | feature-spec.md #2a |
| 8 | Fix revised-listing flow (broken — symptoms TBD, ask user; see `lib/wa-revision-flow.json`) | TBD | added Jun 11 |
| 9 | Listing-flow agreement step: confirm seller is in US/Canada + item is authentic (no copies/knockoffs) before listing goes live | ~2hr | added Jun 11 — do after messaging build |

---

## 🔴 Blocked

| # | Task | Blocked by | Spec |
|---|---|---|---|
| 2b | Payout receipt flow | Meta template approval (utility) | feature-spec.md #2b |
| 3 | WhatsApp messaging dashboard | Meta template approvals + template library audit | feature-spec.md #3 |
| 4 | Easyship tracking → Dashboard + Shopify | Investigation needed (webhook broken) | feature-spec.md #4 |
| 6 | Buyer delivery confirmation + review | Depends on #4 tracking trigger; Meta template needed | feature-spec.md #6 |
| 7 | Offers / bidding system | Open questions unresolved (discuss with cofounder) | feature-spec.md #7 |

---

## 🟡 Ready (no blockers, but lower priority)

| # | Task | Effort | Spec |
|---|---|---|---|
| 5 | Transactions dashboard redesign | 3–4hr | feature-spec.md #5 |

---

## ⏸ On Hold

| Task | Reason |
|---|---|
| Chest-size filter (Shopify storefront) | Need real measurement range confirmed; Shopify theme TBD |
| Rails migration | Paused — actively investing in Node.js app |

---

## ✅ Shipped

| Task | Date | PR / Notes |
|---|---|---|
| Admin listing detail/edit page + Payouts redesign → prod | Jun 16 2026 | Merged `feat/concierge-tracking` → main (`23d7fab`). Listing detail at `/admin/listings/:id` (`action=listing` GET + `action=update-listing` POST). Entry: listings-grid card + approval-queue pencil. Shipped alongside payouts per-seller redesign. |
| Admin view-as-seller + audit log | Jun 11 2026 | Merged to main; `audit_log` table created in Supabase — fully live |
| WhatsApp inbound message forwarding | Jun 11 2026 | Inbound seller messages logged + emailed to admin + Activity feed "Messages" filter |
| Concierge toggle on listings | Apr 2026 | Merged to main |
| Per-listing concierge + optimistic admin create | Apr 2026 | Merged to main |
| Fix admin-added listings missing from seller dashboard | Apr 2026 | Merged to main |

---

## Action Items (non-code)

- [ ] Submit **payout receipt** WhatsApp utility template to Meta
- [ ] Submit **delivery confirmation** WhatsApp utility template to Meta  
- [ ] Audit existing approved WhatsApp templates — list what we already have
- [ ] Discuss offers feature open questions with cofounder (see feature-spec.md #7)
- [ ] Confirm real chest measurement range for Shopify filter (pit-to-pit, likely 16–30")
- [x] Run `scripts/add-audit-log.sql` in Supabase to activate audit logging _(done Jun 11 via Supabase MCP)_
- [ ] Investigate Easyship webhook — check delivery logs in Easyship dashboard
- [ ] **Security:** RLS disabled on 8 public tables (sellers, transactions, messages, auth_codes, …) — anyone with the anon key can read/write them. Decide: enable RLS + policies, or confirm anon key is never shipped to clients
