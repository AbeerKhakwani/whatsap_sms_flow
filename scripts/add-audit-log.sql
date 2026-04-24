-- scripts/add-audit-log.sql
-- Audit log for actions performed while admin is impersonating a seller.
-- Run once in Supabase SQL Editor.

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_admin_email text not null,
  target_seller_email text,
  target_seller_id text,
  action          text not null,
  target_id       text,
  payload         jsonb,
  request_path    text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_audit_log_admin on public.audit_log(actor_admin_email, created_at desc);
create index if not exists idx_audit_log_seller on public.audit_log(target_seller_email, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action, created_at desc);
