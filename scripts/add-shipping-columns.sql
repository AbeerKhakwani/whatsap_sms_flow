-- Add shipping columns to transactions table
-- Run this in Supabase SQL Editor

-- Shipping label and tracking info
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS carrier TEXT DEFAULT 'USPS';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_service TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS easypost_shipment_id TEXT;

-- Shipping status: pending_label, label_created, shipped, delivered
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending_label';

-- Buyer shipping address (from Shopify order)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_address JSONB;

-- Index for shipping status queries
CREATE INDEX IF NOT EXISTS idx_transactions_shipping_status ON transactions(shipping_status);
