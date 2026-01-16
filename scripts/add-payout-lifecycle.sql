-- Add payout lifecycle columns to transactions table
-- Run this in Supabase SQL Editor

-- Order lifecycle tracking
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ship_by TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_window_ends TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- Payout status - tracks the full lifecycle
-- Values: pending_shipping, in_transit, delivered, available, paid, contested
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending_shipping';

-- Contest tracking
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_status TEXT; -- NULL, 'open', 'resolved_buyer', 'resolved_seller'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_notes TEXT;

-- Indexes for cron job queries
CREATE INDEX IF NOT EXISTS idx_transactions_ship_by ON transactions(ship_by);
CREATE INDEX IF NOT EXISTS idx_transactions_payout_status ON transactions(payout_status);
CREATE INDEX IF NOT EXISTS idx_transactions_contest_window_ends ON transactions(contest_window_ends);

-- Migrate existing data based on current statuses
UPDATE transactions
SET payout_status = CASE
  -- Already paid out
  WHEN status = 'paid' THEN 'paid'
  -- Has tracking/shipped = in transit
  WHEN status = 'pending_payout' AND shipping_status IN ('shipped', 'label_created') THEN 'in_transit'
  -- Delivered = available (assume no contest window for existing)
  WHEN status = 'pending_payout' AND shipping_status = 'delivered' THEN 'available'
  -- Fulfilled in Shopify but no shipping status = in transit
  WHEN status = 'pending_payout' AND fulfilled_at IS NOT NULL THEN 'in_transit'
  -- Default: pending shipping
  ELSE 'pending_shipping'
END
WHERE payout_status IS NULL OR payout_status = 'pending_shipping';

-- Set ship_by for existing pending orders (7 days from creation)
UPDATE transactions
SET ship_by = created_at + INTERVAL '7 days'
WHERE ship_by IS NULL AND payout_status = 'pending_shipping';

-- For delivered items, set contest window (3 days from now for migration)
UPDATE transactions
SET
  delivered_at = COALESCE(fulfilled_at, NOW()),
  contest_window_ends = COALESCE(fulfilled_at, NOW()) + INTERVAL '3 days'
WHERE payout_status = 'delivered' AND delivered_at IS NULL;
