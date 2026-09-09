-- ============================================================
-- Is anything managing migrations on this project automatically?
--
-- The Supabase CLI (`db push`) and the GitHub integration both record what they
-- have applied in supabase_migrations.schema_migrations. Migrations pasted into
-- the SQL editor by hand leave no trace there.
--
-- So: rows here mean something automated has been applying migrations and may do
-- so again. No table at all means everything has been done by hand.
--
-- Read-only. Safe to run on production. Creates a temporary function that
-- disappears when the session ends; it touches nothing in your schemas.
--
-- NOTE: the table reference has to go through dynamic SQL. Postgres plans a
-- whole statement before executing it, so naming a missing table anywhere in a
-- query — even inside a CASE branch that would never be taken — fails at plan
-- time with 42P01. Which is exactly the case this script exists to report on.
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.migration_tracking_report()
RETURNS TABLE (verdict text, migration_version text)
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RETURN QUERY SELECT
      'CLEAR — no tracking table. Migrations here have only ever been applied by hand, '
      'so nothing automated will re-apply or revert anything.'::text,
      NULL::text;
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO n;

  IF n = 0 THEN
    RETURN QUERY SELECT
      'CLEAR — tracking table exists but is empty. Nothing automated has applied '
      'a migration.'::text,
      NULL::text;
    RETURN;
  END IF;

  RETURN QUERY EXECUTE
    'SELECT ''AUTOMATED MIGRATIONS PRESENT — something (CLI db push, or a GitHub '
    'integration) has applied migrations here and may do so again.''::text, '
    'version::text FROM supabase_migrations.schema_migrations ORDER BY version';
END;
$$;

SELECT * FROM pg_temp.migration_tracking_report();
