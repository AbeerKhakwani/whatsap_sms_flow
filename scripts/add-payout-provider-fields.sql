-- Part 2: provider-agnostic payout fields.
--
-- WHY: payment method was being stuffed into a free-text note (single mark-paid →
-- seller_note) OR written to a `payout_method` column that DOESN'T EXIST on
-- transactions (bulk mark-paid → silently failing, same class of bug as the
-- missing updated_at column). Structured fields let us auto-fill from the seller,
-- report on payouts, and later flip on automatic Stripe payouts with no rewrite.
--
-- Run once against prod (Supabase SQL editor or MCP apply_migration).

-- Per-transaction: how this specific payout was made.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payout_provider text,   -- 'zelle_manual' today; 'stripe_express' later
  ADD COLUMN IF NOT EXISTS payout_method   text,   -- human label, e.g. 'Zelle'
  ADD COLUMN IF NOT EXISTS payout_handle   text;   -- where it was paid, e.g. 'sara@email.com'

-- Per-seller: their default payout destination (auto-fills the mark-paid form).
-- sellers already has payout_method + paypal_email; add the provider-agnostic pair.
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS payment_provider text,   -- 'zelle' | 'paypal' | 'stripe' | ...
  ADD COLUMN IF NOT EXISTS payment_handle   text;   -- the email/phone to pay

-- Backfill seller defaults from whatever we already have on file.
UPDATE public.sellers
   SET payment_provider = COALESCE(payment_provider, CASE WHEN paypal_email IS NOT NULL AND paypal_email <> '' THEN 'paypal' END),
       payment_handle   = COALESCE(payment_handle, NULLIF(paypal_email, ''));
