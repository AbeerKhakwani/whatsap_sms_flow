-- Part 3b: seller reviews collected from buyers ~1 week after delivery.
-- Run once against prod.

CREATE TABLE IF NOT EXISTS public.seller_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id      uuid REFERENCES public.sellers(id),
  transaction_id uuid REFERENCES public.transactions(id),
  rating         integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_reviews_seller_idx ON public.seller_reviews (seller_id);
-- One review per transaction.
CREATE UNIQUE INDEX IF NOT EXISTS seller_reviews_tx_idx ON public.seller_reviews (transaction_id);
