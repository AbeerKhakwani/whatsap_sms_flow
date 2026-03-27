-- ============================================================
-- PASTE THIS ENTIRE SCRIPT INTO SUPABASE SQL EDITOR AND RUN
-- supabase.com → your project → SQL Editor → New query
-- ============================================================

-- 1. TRANSACTIONS TABLE (create if not exists)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL,
  order_id TEXT NOT NULL,
  order_name TEXT,
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_image TEXT,
  sale_price DECIMAL(10,2) NOT NULL,
  seller_payout DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 18,
  listing_type TEXT DEFAULT 'regular',
  status TEXT DEFAULT 'pending_payout',
  payout_status TEXT DEFAULT 'pending_shipping',
  shipping_status TEXT DEFAULT 'pending_label',
  customer_email TEXT,
  buyer_address JSONB,
  ship_by TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payout_method TEXT,
  payout_reference TEXT,
  shipping_label_url TEXT,
  tracking_number TEXT,
  carrier TEXT DEFAULT 'USPS',
  shipping_service TEXT,
  easypost_shipment_id TEXT,
  admin_note TEXT,
  notes TEXT,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_sent TIMESTAMPTZ,
  contest_window_ends TIMESTAMPTZ,
  contest_status TEXT,
  contest_reason TEXT,
  contest_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ADD ANY MISSING COLUMNS (safe to run even if columns exist)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_image TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS listing_type TEXT DEFAULT 'regular';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending_shipping';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending_label';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_address JSONB;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ship_by TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_window_ends TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS carrier TEXT DEFAULT 'USPS';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_service TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS easypost_shipment_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_status TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contest_notes TEXT;

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_payout_status ON transactions(payout_status);
CREATE INDEX IF NOT EXISTS idx_transactions_shipping_status ON transactions(shipping_status);
CREATE INDEX IF NOT EXISTS idx_transactions_ship_by ON transactions(ship_by);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_order_product ON transactions(order_id, product_id);

-- 4. MESSAGES TABLE — add external_id for WhatsApp delivery tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS messages_external_id_idx ON messages(external_id) WHERE external_id IS NOT NULL;

-- 5. VERIFY — this should return the column list
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'transactions'
ORDER BY ordinal_position;
