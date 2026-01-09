-- Transactions table for tracking sales and payouts
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  order_name TEXT,
  product_id TEXT NOT NULL,
  product_title TEXT,
  sale_price DECIMAL(10,2) NOT NULL,
  seller_payout DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 18,
  status TEXT DEFAULT 'pending_payout',
  customer_email TEXT,
  fulfilled_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payout_method TEXT,
  payout_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Prevent duplicate transactions for same order + product
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_order_product
ON transactions(order_id, product_id);

-- Enable Row Level Security
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Sellers can only see their own transactions
CREATE POLICY "Sellers can view own transactions" ON transactions
  FOR SELECT USING (
    seller_id IN (
      SELECT id FROM sellers WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Policy: Service role can do everything
CREATE POLICY "Service role full access" ON transactions
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- View for seller earnings summary
CREATE OR REPLACE VIEW seller_earnings AS
SELECT
  seller_id,
  COUNT(*) as total_sales,
  SUM(sale_price) as total_revenue,
  SUM(seller_payout) as total_earnings,
  SUM(CASE WHEN status = 'pending_payout' THEN seller_payout ELSE 0 END) as pending_payout,
  SUM(CASE WHEN status = 'paid' THEN seller_payout ELSE 0 END) as paid_out
FROM transactions
GROUP BY seller_id;
