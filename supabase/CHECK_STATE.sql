-- ============================================================
-- Which migrations does THIS database actually have?
--
-- There is no migration tracking table in this project — migrations have been
-- applied by hand in the SQL editor — so nothing records what a given database
-- has had run against it. This checks for each migration's distinguishing
-- artifact instead and reports what is missing.
--
-- Safe to run anywhere: it only reads catalog tables and changes nothing.
--
-- Paste the whole file into the Supabase SQL editor and run it.
-- ============================================================

WITH checks(ord, migration, adds, present) AS (VALUES

  (1, '001_initial_schema',
   'core tables',
   to_regclass('public.profiles') IS NOT NULL
   AND to_regclass('public.credit_ledger') IS NOT NULL),

  (2, '002_security_fixes',
   'profile auto-creation trigger',
   EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created')),

  (3, '003_profile_insert_policy',
   'own-profile INSERT policy',
   EXISTS (SELECT 1 FROM pg_policies
           WHERE tablename = 'profiles' AND cmd = 'INSERT')),

  (4, '003_task_preferences',
   'task_preferences table, interactive-draft columns dropped',
   to_regclass('public.task_preferences') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'draft_state' AND column_name = 'turn_deadline')),

  (5, '004_fix_rls_recursion',
   'get_user_collective_ids()',
   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'get_user_collective_ids')),

  (6, '005_grant_table_privileges',
   'table grants to authenticated',
   EXISTS (SELECT 1 FROM information_schema.role_table_grants
           WHERE grantee = 'authenticated' AND table_name = 'weekly_assignments'
             AND privilege_type = 'SELECT')),

  (7, '006_draft_state_insert',
   'draft_state INSERT policy',
   EXISTS (SELECT 1 FROM pg_policies
           WHERE tablename = 'draft_state' AND cmd = 'INSERT')),

  (8, '007_task_preferences_grant',
   'task_preferences grants',
   EXISTS (SELECT 1 FROM information_schema.role_table_grants
           WHERE grantee = 'authenticated' AND table_name = 'task_preferences'
             AND privilege_type = 'DELETE')),

  (9, '008_own_membership_read_policy',
   'own-membership SELECT policy',
   EXISTS (SELECT 1 FROM pg_policies
           WHERE tablename = 'collective_members'
             AND policyname = 'Users can read own membership')),

  (10, '009_weekly_assignments_delete',
   'assignment DELETE grant + policy  [never applied historically — it errored]',
   EXISTS (SELECT 1 FROM pg_policies
           WHERE tablename = 'weekly_assignments' AND cmd = 'DELETE')),

  (11, '011+012_pending_visibility',
   'pending/paused members visible',
   EXISTS (SELECT 1 FROM pg_proc p
           WHERE p.proname = 'get_user_collective_ids'
             AND pg_get_functiondef(p.oid) LIKE '%pending%')),

  (12, '013_collective_join_hardening',
   'join/create RPCs; collectives no longer world-readable   [SECURITY]',
   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'join_collective_by_code')
   AND NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'collectives'
                     AND policyname = 'Authenticated users can look up any collective')),

  (13, '014_assignment_write_hardening',
   'credits_value/due_date not client-writable; reschedule RPC   [SECURITY]',
   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reschedule_assignment')
   AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                   WHERE grantee = 'authenticated' AND table_name = 'weekly_assignments'
                     AND column_name = 'credits_value' AND privilege_type = 'UPDATE')),

  (14, '015_age_verification',
   'profiles.age_verified_at',
   EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name = 'profiles' AND column_name = 'age_verified_at')),

  (15, '016_denouncement_hardening',
   'accused cannot self-acquit; withdrawal   [SECURITY]',
   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'withdraw_denouncement')
   AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                   WHERE grantee = 'authenticated' AND table_name = 'denouncements'
                     AND column_name = 'outcome' AND privilege_type = 'UPDATE')),

  (16, '017_overdue_reminder',
   'weekly_assignments.notified_overdue_at',
   EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name = 'weekly_assignments' AND column_name = 'notified_overdue_at')),

  (17, '018_function_execute_hardening',
   'credits_transaction not callable by PUBLIC   [CRITICAL]',
   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'credits_transaction')
   AND NOT (SELECT coalesce(array_to_string(proacl, ',') LIKE '=X/%', true)
            FROM pg_proc WHERE proname = 'credits_transaction'))
)
SELECT
  migration,
  CASE WHEN present THEN 'applied' ELSE '>>> MISSING' END AS status,
  adds
FROM checks
ORDER BY ord;
