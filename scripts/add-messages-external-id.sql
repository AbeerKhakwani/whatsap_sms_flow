-- Add external_id to messages table for WhatsApp delivery tracking
-- wamid (WhatsApp message ID) is stored here so we can match delivery receipts

ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS messages_external_id_idx ON messages (external_id) WHERE external_id IS NOT NULL;
