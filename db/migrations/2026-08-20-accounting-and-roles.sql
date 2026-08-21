-- DayHop migration 2026-08-20: accounting ledger + roles v2.
-- Paste this whole file into the Supabase SQL editor and Run. Idempotent.
-- (Everything here is also appended to db/schema.sql — this file is the
-- delta since the last schema run, so one paste brings a live DB current.)

-- (a) Roles v2: owner | deputy | operator, with exactly one owner row.
-- The owner cannot be removed, only swapped via transfer_ownership below.
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users
  add constraint admin_users_role_check check (role in ('owner', 'deputy', 'operator'));
create unique index if not exists admin_users_single_owner
  on public.admin_users ((role)) where role = 'owner';

-- Atomic ownership swap — the only path that changes who the owner is.
-- The old owner is demoted to deputy in the same transaction.
create or replace function public.transfer_ownership(new_owner_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admin_users
                 where email = lower(new_owner_email) and role = 'deputy') then
    raise exception 'target must be an existing deputy';
  end if;
  update admin_users set role = 'deputy' where role = 'owner';
  update admin_users set role = 'owner' where email = lower(new_owner_email);
end $$;
revoke execute on function public.transfer_ownership(text) from public, anon, authenticated;
grant execute on function public.transfer_ownership(text) to service_role;

-- (b) Accounting ledger: one row per money movement, signed integer cents.
-- Income lands automatically from Stripe webhooks/backfill (external_id =
-- invoice/refund id makes re-delivery a no-op); expenses are entered in the
-- admin panel or materialized monthly from recurring_expenses.
create table if not exists public.ledger_entries (
  id                 bigint generated always as identity primary key,
  direction          text not null check (direction in ('income', 'expense')),
  amount_cents       integer not null,          -- signed; refunds are negative income
  fee_cents          integer,                   -- Stripe processing fee when known
  currency           text not null default 'cad',
  occurred_at        timestamptz not null,
  category           text not null default 'uncategorized',
  source             text not null check (source in ('stripe_webhook', 'stripe_backfill', 'manual', 'recurring')),
  external_id        text unique,               -- stripe id or rec:<tpl>:<YYYY-MM>; null for manual
  stripe_customer_id text,
  counterparty       text,                      -- vendor or customer email
  description        text,
  created_by         text,
  meta               jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists ledger_occurred_idx on public.ledger_entries (occurred_at);
create index if not exists ledger_dir_cat_idx  on public.ledger_entries (direction, category);
alter table public.ledger_entries enable row level security;
revoke all on public.ledger_entries from anon, authenticated;

-- (c) Recurring expense templates (Render, Resend, domain...). Materialized
-- into ledger_entries once per month by the server's 2AM Toronto tick.
create table if not exists public.recurring_expenses (
  id           text primary key,                -- slug, e.g. 'render-hosting'
  vendor       text not null,
  category     text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'cad',
  day_of_month integer not null default 1 check (day_of_month between 1 and 28),
  note         text,
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now()
);
alter table public.recurring_expenses enable row level security;
revoke all on public.recurring_expenses from anon, authenticated;
