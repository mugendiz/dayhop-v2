-- DayHop migration 2026-08-18 (b): CRM table hardening.
-- RLS is already enabled with no policies (deny by default); these revokes
-- are belt-and-suspenders so even a future accidental permissive policy
-- can't expose the pipeline through the anon/authenticated PostgREST roles.
-- Paste into the Supabase SQL editor and Run. Idempotent.
revoke all on public.outreach        from anon, authenticated;
revoke all on public.admin_users     from anon, authenticated;
revoke all on public.outreach_events from anon, authenticated;
