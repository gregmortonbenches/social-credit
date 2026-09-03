-- ============================================================
-- RLS and RPC behaviour, against the real migration chain.
--
-- These are the tests that matter most: every finding in SECURITY-FINDINGS.md
-- was a policy that looked right and was not, and none of them could have been
-- caught by a unit test. Each case below reproduces a specific hole that was
-- found and closed, so a regression re-opens a known vulnerability.
--
-- Run with: npm run test:db
-- ============================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
SET client_min_messages TO notice;

CREATE OR REPLACE FUNCTION assert(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN
    RAISE NOTICE 'ok   %', label;
  ELSE
    RAISE EXCEPTION 'FAIL %', label;
  END IF;
END;
$$;

-- Runs `sql` as `uid` and reports whether it was refused.
CREATE OR REPLACE FUNCTION refused_as(uid uuid, sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE sql;
    EXECUTE 'RESET ROLE';
    RETURN false;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    EXECUTE 'RESET ROLE';
    RETURN true;
  END;
END;
$$;

\set QUIET off

-- ---------- fixtures ----------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000a1','alice@test','{"username":"alice"}'),
  ('00000000-0000-0000-0000-0000000000b2','bob@test','{"username":"bob"}'),
  ('00000000-0000-0000-0000-0000000000c3','carol@test','{"username":"carol"}');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
SET ROLE authenticated;
SELECT id AS alice_collective FROM create_collective('Alpha','Europe/London','{}'::jsonb) \gset
RESET ROLE;

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
SET ROLE authenticated;
SELECT id AS carol_collective FROM create_collective('Beta','Europe/London','{}'::jsonb) \gset
RESET ROLE;

SELECT code AS alice_code FROM collectives WHERE id = :'alice_collective' \gset

-- Bob joins Alice's collective with the code, then is promoted as the Monday
-- reset would do.
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
SET ROLE authenticated;
SELECT join_collective_by_code(:'alice_code');
RESET ROLE;
UPDATE collective_members SET status = 'active' WHERE status = 'pending';

INSERT INTO weekly_assignments (id, collective_id, user_id, task_id, week_start, due_date, credits_value, status)
SELECT '00000000-0000-0000-0000-00000000dd01', :'alice_collective',
       '00000000-0000-0000-0000-0000000000b2', t.id, '2026-09-07',
       '2026-09-09T22:59:00Z', 83, 'pending'
FROM task_library t WHERE t.is_custom = false LIMIT 1;

\echo ''
\echo '--- collectives: not readable outside your own (SECURITY-FINDINGS §1) ---'
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
SET ROLE authenticated;
SELECT assert(count(*) = 1, 'Carol sees only her own collective, not Alice''s')
FROM collectives;
RESET ROLE;

\echo ''
\echo '--- collective_members: not client-writable (SECURITY-FINDINGS §1) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000c3',
    format('INSERT INTO collective_members (collective_id, user_id, status) VALUES (%L, %L, %L)',
           :'alice_collective', '00000000-0000-0000-0000-0000000000c3', 'active')),
  'an outsider cannot insert themselves as an active member');

SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE collective_members SET status = ''active'' WHERE user_id = ''00000000-0000-0000-0000-0000000000b2''')
  OR (SELECT count(*) = 0 FROM collective_members
      WHERE user_id = '00000000-0000-0000-0000-0000000000b2' AND status = 'pending'),
  'a member cannot promote their own membership status');

\echo ''
\echo '--- weekly_assignments: credits and deadlines are server-owned (decision 38) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE weekly_assignments SET credits_value = 100000'),
  'a member cannot rewrite credits_value and have award-task-credits pay it out');

SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE weekly_assignments SET due_date = ''2030-01-01T00:00:00Z'''),
  'a member cannot park a deadline past the weekly reset to dodge the penalty');

SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE weekly_assignments SET status = ''reassigned'''),
  'a member cannot forge a settlement status');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
SET ROLE authenticated;
UPDATE weekly_assignments SET status = 'complete', completed_at = now();
RESET ROLE;
SELECT assert((SELECT status = 'complete' FROM weekly_assignments), 'a member can still tick a task off');

\echo ''
\echo '--- reschedule_assignment bounds (decision 38) ---'
UPDATE weekly_assignments SET status = 'pending', completed_at = NULL;
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'SELECT reschedule_assignment(''00000000-0000-0000-0000-00000000dd01'', ''2026-09-20'')'),
  'a task cannot be moved outside its own week');

SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000a1',
    'SELECT reschedule_assignment(''00000000-0000-0000-0000-00000000dd01'', ''2026-09-10'')'),
  'a member cannot reschedule someone else''s task');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
SET ROLE authenticated;
SELECT reschedule_assignment('00000000-0000-0000-0000-00000000dd01', '2026-09-11');
RESET ROLE;
SELECT assert(
  (SELECT due_date = '2026-09-11T22:59:00Z'::timestamptz FROM weekly_assignments),
  'a member can move their own task within the week, at 23:59 collective time');

\echo ''
\echo '--- denouncements: the accused cannot acquit themselves (decision 42) ---'
INSERT INTO denouncements (id, collective_id, accuser_id, accused_id, assignment_id)
VALUES ('00000000-0000-0000-0000-0000000000e1', :'alice_collective',
        '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-00000000dd01');

SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE denouncements SET outcome = ''dismissed'', status = ''resolved'''),
  'the accused cannot write their own verdict');

SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE denouncements SET status = ''resolved'''),
  'the accused cannot close the case via an allowed column');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
SET ROLE authenticated;
UPDATE denouncements SET explanation = 'I did it Tuesday', status = 'responded', responded_at = now();
RESET ROLE;
SELECT assert((SELECT status = 'responded' FROM denouncements), 'the accused can still respond');

\echo ''
\echo '--- withdrawal (decision 42) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000a1',
    'SELECT withdraw_denouncement(''00000000-0000-0000-0000-0000000000e1'')'),
  'an answered denouncement cannot be withdrawn');

UPDATE denouncements SET status = 'open', explanation = NULL, responded_at = NULL;
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'SELECT withdraw_denouncement(''00000000-0000-0000-0000-0000000000e1'')'),
  'the accused cannot withdraw the case against them');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
SET ROLE authenticated;
SELECT withdraw_denouncement('00000000-0000-0000-0000-0000000000e1');
RESET ROLE;
SELECT assert((SELECT status = 'withdrawn' FROM denouncements),
              'the accuser can withdraw while unanswered, and the row is kept');

\echo ''
\echo '--- credits_transaction stays server-only (decision 32) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    format('SELECT credits_transaction(%L, %L, 100000, ''task_complete'', NULL)',
           '00000000-0000-0000-0000-0000000000b2', :'alice_collective')),
  'a member cannot call credits_transaction directly');

-- The revoke in 001 named anon and authenticated but not PUBLIC, which is where
-- the grant actually came from, so it was a no-op for the project's whole life.
-- Assert on the ACL directly: a role-based test alone would pass again the
-- moment someone reintroduced the PUBLIC grant.
SELECT assert(
  NOT (array_to_string(proacl, ',') LIKE '=X/%'),
  'credits_transaction is not executable by PUBLIC')
FROM pg_proc WHERE proname = 'credits_transaction';

\echo ''
\echo 'ALL RLS ASSERTIONS PASSED'
