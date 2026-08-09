-- Grant table-level privileges for task_preferences to authenticated role.
-- This table was missing from 005_grant_table_privileges.sql, causing
-- "permission denied" errors even though RLS policies exist — Postgres
-- rejects the query before evaluating RLS if table grants are absent.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_preferences TO authenticated;
