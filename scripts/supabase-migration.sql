-- Add new columns to sellers table for product tracking and earnings
-- Run this in Supabase SQL Editor

-- Add products JSONB column (stores full product history)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]'::jsonb;

-- Add commission rate (seller's typical split percentage, e.g. 50 or 85)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS commission_rate INTEGER DEFAULT 50;

-- Add total earnings (sum of all sold items)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0;

-- Add pending payout (sold but not yet paid out)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS pending_payout DECIMAL(10,2) DEFAULT 0;

-- Create index on products for faster queries
CREATE INDEX IF NOT EXISTS idx_sellers_products ON sellers USING GIN (products);

-- Verify the schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sellers';
