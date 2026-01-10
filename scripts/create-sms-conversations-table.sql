-- Create sms_conversations table for WhatsApp conversation state management
-- This replaces the whatsapp_sessions table with a more robust design

CREATE TABLE IF NOT EXISTS sms_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'new',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  authorized BOOLEAN NOT NULL DEFAULT false,
  authorized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index on phone for fast lookups
CREATE INDEX IF NOT EXISTS idx_sms_conversations_phone ON sms_conversations(phone);

-- Add index on seller_id for seller-based queries
CREATE INDEX IF NOT EXISTS idx_sms_conversations_seller_id ON sms_conversations(seller_id);

-- Add index on state for state-based queries
CREATE INDEX IF NOT EXISTS idx_sms_conversations_state ON sms_conversations(state);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sms_conversations_updated_at
  BEFORE UPDATE ON sms_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE sms_conversations IS 'Stores WhatsApp conversation state and context for the sell flow';
COMMENT ON COLUMN sms_conversations.phone IS 'User phone number (E.164 format)';
COMMENT ON COLUMN sms_conversations.seller_id IS 'Reference to sellers table after email verification';
COMMENT ON COLUMN sms_conversations.state IS 'Current conversation state (new, awaiting_email, authorized, sell_collecting, sell_photos, etc.)';
COMMENT ON COLUMN sms_conversations.context IS 'JSONB containing listing_data, processed_messages, shopify_file_ids, etc.';
COMMENT ON COLUMN sms_conversations.authorized IS 'Whether user has completed email verification';
COMMENT ON COLUMN sms_conversations.authorized_at IS 'Timestamp of successful email verification';

-- Example context structure:
-- {
--   "listing_data": {
--     "designer": "Sana Safinaz",
--     "item_type": "Lawn Suit",
--     "size": "Medium",
--     "condition": "Gently Used",
--     "asking_price_usd": 45,
--     "description": "Beautiful lawn suit...",
--     "additional_details": null
--   },
--   "shopify_file_ids": ["gid://shopify/MediaImage/123", "gid://shopify/MediaImage/456"],
--   "processed_messages": ["wamid_xxx", "wamid_yyy"],
--   "current_field": "size",
--   "email": "user@example.com"
-- }
