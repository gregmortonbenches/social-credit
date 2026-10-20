-- ============================================================
-- Social Credit — Migration 022: table privileges for service_role
--
-- 005 granted table privileges to `authenticated` only. `service_role` bypasses
-- row-level security but still needs ordinary GRANTs, and in this project it had
-- none on any public table. Every Edge Function that reads or writes with the
-- service role key therefore got "permission denied" — and, because several of
-- them ignore the error on a read, answered as if the row did not exist. The
-- visible symptom: Settings -> Force Assign returned 403 "Forbidden" for a
-- genuine admin who was an active member, because the `profiles` and
-- `collective_members` reads silently failed.
--
-- service_role is the trusted server identity (it is the key the app must never
-- hold), so full DML on the public tables is the standard Supabase default.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Tables added by later migrations get the same.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
