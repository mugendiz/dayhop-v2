-- DayHop V2 — 2026-10-20 — testimonial_requests (the "how did it work out?" ask)
--
-- One row per guide BUYER (email is unique), written by
-- fulfillCheckoutSessionOnce on a paid guide or bundle purchase. The sweep in
-- services/testimonialAsk.js sends ONE follow-up 7 days later and stamps
-- asked_at. Nothing sends unless TESTIMONIAL_EMAILS=on.
--
-- Replies (and any consent to be quoted) arrive at admin@dayhop.quest and
-- become data/testimonials.js entries by hand: docs/testimonials.md.
--
-- RLS: NO anon/authenticated policies on purpose. Buyer emails are PII,
-- read/written only server-side with SUPABASE_SERVICE_KEY.

create table if not exists public.testimonial_requests (
  email             text primary key,
  guide_slug        text not null,
  guide_label       text not null default '',
  stripe_session_id text,
  purchased_at      timestamptz not null default now(),
  asked_at          timestamptz
);

create index if not exists testimonial_requests_sweep_idx
  on public.testimonial_requests (asked_at, purchased_at);

alter table public.testimonial_requests enable row level security;
