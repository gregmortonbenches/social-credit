-- ============================================================
-- Is anything managing migrations on this project automatically?
--
-- The Supabase CLI (`db push`) and the GitHub integration both record what they
-- have applied in supabase_migrations.schema_migrations. Migrations pasted into
-- the SQL editor by hand leave no trace there.
--
-- So: rows here mean something automated has been applying migrations, and it
-- may keep doing so. An empty or absent table means everything has been done by
-- hand, and nothing will fight you.
--
-- Read-only. Safe to run on production.
-- ============================================================

SELECT
  CASE
    WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
      THEN 'No tracking table — migrations here have only ever been applied by hand.'
    WHEN (SELECT count(*) FROM supabase_migrations.schema_migrations) = 0
      THEN 'Tracking table exists but is empty — nothing automated has applied a migration.'
    ELSE 'AUTOMATED MIGRATIONS PRESENT — see the rows below. Something (CLI db push, '
         || 'or a GitHub integration) has applied migrations to this project and may do so again.'
  END AS verdict;

-- The detail, when there is any.
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY version;
