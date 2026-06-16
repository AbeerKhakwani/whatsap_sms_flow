-- Part 3a: buyer delivery confirmation + 3b seller-review scheduling.
--
-- After delivery the buyer gets a friendly "got it?" message (WhatsApp if we have
-- their phone, else email). Tapping confirm releases the payout immediately; no
-- reply within 48h auto-releases (existing cron). No dispute automation — issues
-- are handled by the buyer emailing admin@thephirstory.com.
--
-- Run once against prod.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS review_status          text,        -- requested | confirmed | expired
  ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz, -- send-once guard
  ADD COLUMN IF NOT EXISTS review_channel         text,        -- whatsapp | email
  ADD COLUMN IF NOT EXISTS review_responded_at    timestamptz, -- respond-once guard
  ADD COLUMN IF NOT EXISTS review_token           text,        -- email-link lookup (256-bit hex)
  ADD COLUMN IF NOT EXISTS seller_review_sent_at  timestamptz; -- 3b: seller-review request guard

CREATE UNIQUE INDEX IF NOT EXISTS transactions_review_token_idx
  ON public.transactions (review_token) WHERE review_token IS NOT NULL;
