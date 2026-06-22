-- Test-environment schema snapshot — generated from production (the-phir-story-mvp) on 2026-06-22.
-- Apply to an isolated test database (branch / new project / local supabase) for safe lifecycle testing.
-- Columns + defaults + primary keys only. RLS intentionally omitted (service key bypasses it; prod has RLS off).
-- Backup tables (ownership_backup_*) intentionally excluded.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.admin_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_admin_email text NOT NULL,
  target_seller_email text,
  target_seller_id text,
  action text NOT NULL,
  target_id text,
  payload jsonb,
  request_path text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.auth_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  code text NOT NULL,
  channel text DEFAULT 'email'::text,
  expires_at timestamp with time zone NOT NULL,
  attempts integer DEFAULT 0,
  used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.listings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  seller_id uuid,
  conversation_id uuid,
  status text DEFAULT 'draft'::text,
  designer text,
  item_type text,
  pieces_included text,
  size text,
  condition text,
  asking_price_usd numeric,
  photo_tag_url text,
  photo_urls text[] DEFAULT '{}'::text[],
  shopify_product_id text,
  shopify_product_url text,
  input_method text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  details text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid,
  type text NOT NULL,
  recipient text,
  subject text,
  content text NOT NULL,
  context text,
  metadata jsonb,
  status text DEFAULT 'sent'::text,
  created_at timestamp with time zone DEFAULT now(),
  external_id text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  product_title text,
  product_image text,
  listing_price numeric(10,2),
  seller_id uuid,
  buyer_email text NOT NULL,
  buyer_phone text,
  amount numeric(10,2) NOT NULL,
  note text,
  status text DEFAULT 'pending'::text,
  counter_round integer DEFAULT 0,
  last_action_by text,
  history jsonb DEFAULT '[]'::jsonb,
  draft_order_id text,
  checkout_url text,
  checkout_expires_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  responded_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rejected_listings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid,
  shopify_product_id text NOT NULL,
  title text,
  designer text,
  item_type text,
  size text,
  condition text,
  asking_price numeric(10,2),
  listing_price numeric(10,2),
  images jsonb DEFAULT '[]'::jsonb,
  rejection_reason text,
  rejection_note text,
  submission_source text,
  original_tags text,
  created_at timestamp with time zone DEFAULT now(),
  rejected_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.seller_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid,
  transaction_id uuid,
  rating integer NOT NULL,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sellers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now(),
  email text,
  shopify_product_ids text[] DEFAULT '{}'::text[],
  products jsonb DEFAULT '[]'::jsonb,
  commission_rate integer DEFAULT 50,
  total_earnings numeric(10,2) DEFAULT 0,
  pending_payout numeric(10,2) DEFAULT 0,
  paypal_email text,
  shipping_address jsonb,
  payout_method jsonb,
  last_dashboard_login timestamp with time zone,
  payment_provider text,
  payment_handle text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  phone_number text NOT NULL,
  seller_id uuid,
  state text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  is_authorized boolean DEFAULT false,
  context jsonb DEFAULT '{}'::jsonb,
  authorized_at timestamp with time zone,
  auth_attempts integer DEFAULT 0,
  last_auth_attempt timestamp with time zone,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid,
  order_id text NOT NULL,
  order_name text,
  product_id text NOT NULL,
  product_title text,
  sale_price numeric(10,2),
  seller_payout numeric(10,2),
  commission_rate numeric(5,2) DEFAULT 18,
  status text DEFAULT 'pending_payout'::text,
  customer_email text,
  created_at timestamp with time zone DEFAULT now(),
  paid_at timestamp with time zone,
  seller_note text,
  admin_note text,
  shipping_label_url text,
  tracking_number text,
  carrier text DEFAULT 'USPS'::text,
  shipping_service text,
  easypost_shipment_id text,
  shipping_status text DEFAULT 'pending_label'::text,
  buyer_address jsonb,
  ship_by timestamp with time zone,
  delivered_at timestamp with time zone,
  contest_window_ends timestamp with time zone,
  last_reminder_sent timestamp with time zone,
  reminder_count integer DEFAULT 0,
  payout_status text DEFAULT 'pending_shipping'::text,
  contest_status text,
  contest_reason text,
  contest_notes text,
  listing_type text DEFAULT 'regular'::text,
  product_image text,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  platform_fee numeric(10,2) NOT NULL DEFAULT 10,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payout_provider text,
  payout_method text,
  payout_handle text,
  review_status text,
  review_request_sent_at timestamp with time zone,
  review_channel text,
  review_responded_at timestamp with time zone,
  review_token text,
  seller_review_sent_at timestamp with time zone,
  payout_notes text,
  payout_reference text,
  payout_hold boolean NOT NULL DEFAULT false,
  payout_hold_reason text,
  fulfilled_at timestamp with time zone,
  payout_screenshot_url text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  phone text NOT NULL,
  state text DEFAULT 'welcome'::text,
  email text,
  listing jsonb DEFAULT '{}'::jsonb,
  photos text[] DEFAULT '{}'::text[],
  early_photos text[] DEFAULT '{}'::text[],
  current_field text,
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (phone)
);
