-- Run this in Supabase SQL Editor
-- supabase.com → your project → SQL Editor → New query

CREATE TABLE IF NOT EXISTS offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_image TEXT,
  listing_price DECIMAL(10,2),
  seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL,
  -- Buyer info (never exposed to seller)
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  -- Offer state
  amount DECIMAL(10,2) NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending',  -- pending | countered | accepted | rejected | expired | withdrawn
  counter_round INTEGER DEFAULT 0, -- 0=initial, 1-3=counter rounds
  last_action_by TEXT,             -- 'buyer' | 'seller'
  -- Full history of all bids/counters as JSONB array
  history JSONB DEFAULT '[]',
  -- Set when accepted
  draft_order_id TEXT,
  checkout_url TEXT,
  checkout_expires_at TIMESTAMPTZ,
  -- Timestamps
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_product_id ON offers(product_id);
CREATE INDEX IF NOT EXISTS idx_offers_seller_id ON offers(seller_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_buyer_email ON offers(buyer_email);
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers(created_at DESC);

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'offers' ORDER BY ordinal_position;
