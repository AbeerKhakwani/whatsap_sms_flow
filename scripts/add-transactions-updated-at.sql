-- Add the missing updated_at column + auto-update trigger to transactions.
--
-- ROOT CAUSE (Jun 15 2026): the prod `transactions` table never had an
-- `updated_at` column, but several writers set it — process-payouts cron
-- (flips delivered→available), the order-cancel handler, and the Shippo
-- delivery webhook. PostgREST rejected those updates ("column not in schema
-- cache"), so the whole update failed and items stayed stuck at 'delivered',
-- never becoming payable.
--
-- Run once against prod (Supabase SQL editor or MCP apply_migration).

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows to a sensible value.
UPDATE public.transactions SET updated_at = COALESCE(paid_at, created_at, now());

CREATE OR REPLACE FUNCTION public.set_transactions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transactions_set_updated_at ON public.transactions;
CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_transactions_updated_at();
