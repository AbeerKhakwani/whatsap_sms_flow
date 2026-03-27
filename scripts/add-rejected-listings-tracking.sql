-- Migration: Add rejected_listings table + last_dashboard_login to sellers
-- Run this in Supabase SQL editor

-- 1. Add last_dashboard_login to sellers table
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS last_dashboard_login TIMESTAMPTZ;

-- 2. Create rejected_listings table to preserve rejected listing data
CREATE TABLE IF NOT EXISTS rejected_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES sellers(id),
  shopify_product_id TEXT NOT NULL,
  title TEXT,
  designer TEXT,
  item_type TEXT,
  size TEXT,
  condition TEXT,
  asking_price DECIMAL(10,2),
  listing_price DECIMAL(10,2),
  images JSONB DEFAULT '[]',
  rejection_reason TEXT,
  rejection_note TEXT,
  submission_source TEXT, -- 'portal', 'whatsapp', 'admin', 'email'
  original_tags TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rejected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rejected_listings_seller_id ON rejected_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_rejected_listings_rejected_at ON rejected_listings(rejected_at DESC);

-- RLS
ALTER TABLE rejected_listings ENABLE ROW LEVEL SECURITY;

-- Sellers can view their own rejected listings
CREATE POLICY "Sellers can view own rejected listings"
  ON rejected_listings
  FOR SELECT
  USING (seller_id IN (SELECT id FROM sellers WHERE id = seller_id));

-- Service role has full access
CREATE POLICY "Service role full access to rejected_listings"
  ON rejected_listings
  FOR ALL
  USING (true)
  WITH CHECK (true);
