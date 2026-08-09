-- ============================================================
-- 005 Grant table-level privileges to authenticated role
-- Supabase's Table Editor auto-grants these; raw SQL migrations
-- do not. Without these, RLS policies are irrelevant — Postgres
-- rejects the query before even evaluating the policy.
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.collectives TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.collective_members TO authenticated;
GRANT SELECT, INSERT ON public.task_library TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.weekly_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.denouncements TO authenticated;
GRANT SELECT, INSERT ON public.denouncement_votes TO authenticated;
GRANT SELECT, UPDATE ON public.draft_state TO authenticated;
GRANT SELECT ON public.achievements TO authenticated;
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT SELECT, UPDATE ON public.app_config TO authenticated;
