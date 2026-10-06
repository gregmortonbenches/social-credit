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
\echo '--- collectives: prosperity is server-owned (migration 019) ---'
-- Alice founded the collective, so the update POLICY would allow her to write
-- any column; only the column-level grant stops her.
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000a1',
    'UPDATE collectives SET prosperity_streak = 99'),
  'the founder cannot set the Collective''s own prosperity streak');

SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000a1',
    'UPDATE collectives SET prosperity_week = ''2030-01-01'''),
  'the founder cannot pre-empt the weekly settlement');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
SET ROLE authenticated;
UPDATE collectives SET name = 'Renamed', display_name = 'Renamed Collective'
  WHERE id = :'alice_collective';
RESET ROLE;
SELECT assert(
  (SELECT display_name = 'Renamed Collective' FROM collectives WHERE id = :'alice_collective'),
  'the founder can still rename the Collective');

-- ============================================================
-- Migration 020: economy write hardening and atomic settlement
-- ============================================================

CREATE OR REPLACE FUNCTION credits_of(uid uuid) RETURNS int
LANGUAGE sql AS $$ SELECT total_credits FROM profiles WHERE id = uid $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000d4','dave@test','{"username":"dave"}'),
  ('00000000-0000-0000-0000-0000000000e5','erin@test','{"username":"erin"}');

-- Dave joins Alpha (a juror for Alice v Bob); Erin joins Beta, making it a
-- Collective of exactly two.
SELECT code AS carol_code FROM collectives WHERE id = :'carol_collective' \gset
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
SET ROLE authenticated;
SELECT join_collective_by_code(:'alice_code');
RESET ROLE;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
SET ROLE authenticated;
SELECT join_collective_by_code(:'carol_code');
RESET ROLE;
UPDATE collective_members SET status = 'active' WHERE status = 'pending';

\echo ''
\echo '--- profiles: credits and the admin flag are server-owned (020) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE profiles SET total_credits = 1000000 WHERE id = ''00000000-0000-0000-0000-0000000000b2'''),
  'a member cannot write their own total_credits');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE profiles SET is_admin = true WHERE id = ''00000000-0000-0000-0000-0000000000b2'''),
  'a member cannot make themselves an admin');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE profiles SET age_verified_at = now() WHERE id = ''00000000-0000-0000-0000-0000000000b2'''),
  'a member cannot rewrite the age-check record');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'INSERT INTO profiles (id, username, email, total_credits) VALUES (gen_random_uuid(), ''x'', ''x@test'', 1000000)'),
  'a sign-up fallback insert cannot choose its own balance');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
SET ROLE authenticated;
UPDATE profiles SET username = 'bobby', device_push_token = 'tok' WHERE id = '00000000-0000-0000-0000-0000000000b2';
RESET ROLE;
SELECT assert((SELECT username = 'bobby' FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000b2'),
  'a member can still change their own username and push token');

\echo ''
\echo '--- weekly_assignments: server-written (020) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    format('INSERT INTO weekly_assignments (collective_id, user_id, task_id, week_start, due_date, credits_value, status)
            SELECT %L, %L, id, ''2026-09-21'', now(), 100000, ''complete'' FROM task_library LIMIT 1',
           :'alice_collective', '00000000-0000-0000-0000-0000000000b2')),
  'a member cannot invent a completed assignment worth 100000 credits');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2', 'DELETE FROM weekly_assignments'),
  'a member cannot delete assignments to dodge a penalty');

-- Fixtures for this and the settlement tests: week 2026-09-14, Alpha.
INSERT INTO weekly_assignments (id, collective_id, user_id, task_id, week_start, due_date, credits_value, status)
SELECT ('00000000-0000-0000-0000-00000000f0' || lpad(n::text, 2, '0'))::uuid,
       :'alice_collective', '00000000-0000-0000-0000-0000000000b2', t.id, '2026-09-14',
       '2026-09-15T22:59:00Z', 100, 'pending'
FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM task_library WHERE is_custom = false) t
WHERE n <= 4;

SELECT assert(
  (SELECT count(*) FROM weekly_assignments WHERE week_start = '2026-09-14') = 4,
  'fixtures: four assignments for the week');

-- Same task, same week, same Collective: refused by the unique index.
DO $$
BEGIN
  BEGIN
    INSERT INTO weekly_assignments (collective_id, user_id, task_id, week_start, due_date, credits_value)
    SELECT collective_id, user_id, task_id, week_start, due_date, credits_value
    FROM weekly_assignments WHERE week_start = '2026-09-14' LIMIT 1;
    RAISE EXCEPTION 'FAIL a task can be assigned twice in one week';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   a task cannot be assigned twice in one week';
  END;
END $$;

-- 'failed' -> 'complete' used to un-do a penalty. The UPDATE policy now hides
-- non-pending/complete rows, so this is a silent no-op rather than an error.
UPDATE weekly_assignments SET status = 'failed'
  WHERE id = '00000000-0000-0000-0000-00000000f001';
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
SET ROLE authenticated;
UPDATE weekly_assignments SET status = 'complete', completed_at = now()
  WHERE id = '00000000-0000-0000-0000-00000000f001';
RESET ROLE;
SELECT assert(
  (SELECT status = 'failed' FROM weekly_assignments WHERE id = '00000000-0000-0000-0000-00000000f001'),
  'a failed task cannot be flipped back to complete');
DELETE FROM weekly_assignments WHERE id = '00000000-0000-0000-0000-00000000f001';

\echo ''
\echo '--- draft_state: read-only to members (020) ---'
INSERT INTO draft_state (collective_id, week_start, status)
VALUES (:'alice_collective', '2026-09-14', 'pending');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'UPDATE draft_state SET status = ''complete'''),
  'a member cannot mark the week assigned to stop auto-assign');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    format('INSERT INTO draft_state (collective_id, week_start, status) VALUES (%L, ''2026-09-21'', ''complete'')',
           :'alice_collective')),
  'a member cannot pre-seed a draft_state row');

\echo ''
\echo '--- credits_transaction is idempotent (020) ---'
SELECT credits_of('00000000-0000-0000-0000-0000000000d4') AS dave_before \gset
SELECT credits_transaction('00000000-0000-0000-0000-0000000000d4', :'alice_collective', 50, 'task_complete',
                           '00000000-0000-0000-0000-0000000000f9');
SELECT credits_transaction('00000000-0000-0000-0000-0000000000d4', :'alice_collective', 50, 'task_complete',
                           '00000000-0000-0000-0000-0000000000f9');
SELECT assert(
  credits_of('00000000-0000-0000-0000-0000000000d4') = :dave_before + 50
  AND (SELECT count(*) FROM credit_ledger WHERE reference_id = '00000000-0000-0000-0000-0000000000f9') = 1,
  'paying the same reference twice moves the balance once');

\echo ''
\echo '--- settle_assignments (020) ---'
UPDATE weekly_assignments SET status = 'complete', completed_at = now()
  WHERE id = '00000000-0000-0000-0000-00000000f002';
SELECT credits_of('00000000-0000-0000-0000-0000000000b2') AS bob_before \gset
SELECT settle_assignments(:'alice_collective', '2026-09-14', '2026-09-20T23:00:00Z');
SELECT settle_assignments(:'alice_collective', '2026-09-14', '2026-09-20T23:00:00Z');
-- f002 complete (+100), f003 and f004 overdue and pending (-100 each); once only.
SELECT assert(
  credits_of('00000000-0000-0000-0000-0000000000b2') = :bob_before + 100 - 200,
  'overdue tasks cost their value and completed ones pay it, exactly once');
SELECT assert(
  (SELECT count(*) = 2 FROM weekly_assignments
   WHERE week_start = '2026-09-14' AND status = 'failed'),
  'overdue pending tasks are marked failed');

\echo ''
\echo '--- settle_denouncements: timeout, votes, penalties (020) ---'
-- Alpha: Alice accuses Bob. Jurors: Dave only.
CREATE OR REPLACE FUNCTION settle() RETURNS void LANGUAGE sql AS
$$ SELECT settle_denouncements(24, 24, 100, 50, 3, 150, 60) $$;

-- (a) Unanswered past the window: auto-guilty, accused pays, accuser is rewarded.
INSERT INTO denouncements (id, collective_id, accuser_id, accused_id, assignment_id, created_at)
VALUES ('00000000-0000-0000-0000-0000000000e2', :'alice_collective',
        '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-00000000f003', now() - interval '25 hours');
SELECT credits_of('00000000-0000-0000-0000-0000000000a1') AS alice_0,
       credits_of('00000000-0000-0000-0000-0000000000b2') AS bob_0 \gset
SELECT settle();
SELECT settle();
SELECT assert(
  (SELECT status = 'auto_guilty' AND outcome = 'upheld' FROM denouncements WHERE id = '00000000-0000-0000-0000-0000000000e2')
  AND credits_of('00000000-0000-0000-0000-0000000000b2') = :bob_0 - 100
  AND credits_of('00000000-0000-0000-0000-0000000000a1') = :alice_0 + 100,
  'an unanswered denouncement is auto-guilty, and settles once');

-- (b) Not yet 24h old: left alone.
INSERT INTO denouncements (id, collective_id, accuser_id, accused_id, assignment_id)
VALUES ('00000000-0000-0000-0000-0000000000e3', :'alice_collective',
        '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-00000000f004');
SELECT settle();
SELECT assert(
  (SELECT status = 'open' FROM denouncements WHERE id = '00000000-0000-0000-0000-0000000000e3'),
  'a fresh denouncement is not timed out');

-- (c) Answered, juror has not voted yet: waits.
UPDATE denouncements SET status = 'responded', responded_at = now(), explanation = 'done'
  WHERE id = '00000000-0000-0000-0000-0000000000e3';
SELECT settle();
SELECT assert(
  (SELECT status = 'responded' FROM denouncements WHERE id = '00000000-0000-0000-0000-0000000000e3'),
  'an answered denouncement waits for the vote');

-- The parties may not vote on their own case (020 policy); the juror may.
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000a1',
    'INSERT INTO denouncement_votes (denouncement_id, voter_id, vote) VALUES (''00000000-0000-0000-0000-0000000000e3'', ''00000000-0000-0000-0000-0000000000a1'', ''uphold'')'),
  'the accuser cannot vote on their own denouncement');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    'INSERT INTO denouncement_votes (denouncement_id, voter_id, vote) VALUES (''00000000-0000-0000-0000-0000000000e3'', ''00000000-0000-0000-0000-0000000000b2'', ''dismiss'')'),
  'the accused cannot vote on their own denouncement');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000d4',
    'INSERT INTO denouncement_votes (denouncement_id, voter_id, vote) VALUES (''00000000-0000-0000-0000-0000000000e2'', ''00000000-0000-0000-0000-0000000000d4'', ''dismiss'')'),
  'nobody can vote on a case that is not up for a vote');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000c3',
    'INSERT INTO denouncement_votes (denouncement_id, voter_id, vote) VALUES (''00000000-0000-0000-0000-0000000000e3'', ''00000000-0000-0000-0000-0000000000c3'', ''dismiss'')'),
  'an outsider cannot vote');

SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
SET ROLE authenticated;
INSERT INTO denouncement_votes (denouncement_id, voter_id, vote)
  VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d4', 'dismiss');
RESET ROLE;

-- (d) Every juror has voted 'dismiss': dismissed, and the accuser pays.
SELECT credits_of('00000000-0000-0000-0000-0000000000a1') AS alice_1 \gset
SELECT settle();
SELECT settle();
SELECT assert(
  (SELECT status = 'resolved' AND outcome = 'dismissed' FROM denouncements WHERE id = '00000000-0000-0000-0000-0000000000e3')
  AND credits_of('00000000-0000-0000-0000-0000000000a1') = :alice_1 - 50,
  'a dismissed denouncement costs the accuser, once');

-- (e) Answered, nobody votes, window passes: tie is dismissed.
INSERT INTO weekly_assignments (id, collective_id, user_id, task_id, week_start, due_date, credits_value)
SELECT '00000000-0000-0000-0000-00000000f005', :'alice_collective', '00000000-0000-0000-0000-0000000000b2', id,
       '2026-09-14', now(), 100
FROM task_library WHERE is_custom = false AND id NOT IN (SELECT task_id FROM weekly_assignments WHERE week_start = '2026-09-14')
LIMIT 1;
INSERT INTO denouncements (id, collective_id, accuser_id, accused_id, assignment_id, status, responded_at, explanation)
VALUES ('00000000-0000-0000-0000-0000000000e4', :'alice_collective',
        '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-00000000f005', 'responded', now() - interval '25 hours', 'done');
SELECT settle();
SELECT assert(
  (SELECT status = 'resolved' AND outcome = 'dismissed' FROM denouncements WHERE id = '00000000-0000-0000-0000-0000000000e4'),
  'with no votes by the deadline the case is dismissed (tie)');

-- (f) A majority to uphold.
INSERT INTO weekly_assignments (id, collective_id, user_id, task_id, week_start, due_date, credits_value)
SELECT '00000000-0000-0000-0000-00000000f006', :'alice_collective', '00000000-0000-0000-0000-0000000000b2', id,
       '2026-09-14', now(), 100
FROM task_library WHERE is_custom = false AND id NOT IN (SELECT task_id FROM weekly_assignments WHERE week_start = '2026-09-14')
LIMIT 1;
INSERT INTO denouncements (id, collective_id, accuser_id, accused_id, assignment_id, status, responded_at, explanation)
VALUES ('00000000-0000-0000-0000-0000000000e6', :'alice_collective',
        '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-00000000f006', 'responded', now(), 'done');
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
SET ROLE authenticated;
INSERT INTO denouncement_votes (denouncement_id, voter_id, vote)
  VALUES ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000d4', 'uphold');
RESET ROLE;
SELECT credits_of('00000000-0000-0000-0000-0000000000b2') AS bob_2 \gset
SELECT settle();
SELECT assert(
  (SELECT status = 'resolved' AND outcome = 'upheld' FROM denouncements WHERE id = '00000000-0000-0000-0000-0000000000e6')
  AND credits_of('00000000-0000-0000-0000-0000000000b2') = :bob_2 - 100,
  'a majority to uphold costs the accused the duty''s value');

-- (g) Two-person Collective: answered, nobody to vote, so upheld outright; and
-- the third denouncement within the window trips the abuse rule, once.
SELECT credits_of('00000000-0000-0000-0000-0000000000c3') AS carol_0,
       credits_of('00000000-0000-0000-0000-0000000000e5') AS erin_0 \gset
INSERT INTO weekly_assignments (id, collective_id, user_id, task_id, week_start, due_date, credits_value)
SELECT ('00000000-0000-0000-0000-00000000f1' || lpad(n::text, 2, '0'))::uuid,
       :'carol_collective', '00000000-0000-0000-0000-0000000000e5', id, '2026-09-14', now(), 100
FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM task_library WHERE is_custom = false) t WHERE n <= 3;
INSERT INTO denouncements (id, collective_id, accuser_id, accused_id, assignment_id, status, responded_at, explanation, created_at)
SELECT ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, :'carol_collective',
       '00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e5',
       ('00000000-0000-0000-0000-00000000f1' || lpad(n::text, 2, '0'))::uuid, 'responded', now(), 'done',
       now() - (4 - n) * interval '1 day'
FROM generate_series(1, 3) n;
SELECT settle();
SELECT settle();
-- Three upheld: accused -300, accuser +300; abuse penalty -150 each, applied once.
SELECT assert(
  (SELECT count(*) = 3 FROM denouncements WHERE collective_id = :'carol_collective' AND outcome = 'upheld')
  AND credits_of('00000000-0000-0000-0000-0000000000e5') = :erin_0 - 300 - 150
  AND credits_of('00000000-0000-0000-0000-0000000000c3') = :carol_0 + 300 - 150
  AND (SELECT count(*) FROM credit_ledger WHERE reason = 'denouncement_abuse_penalty'
        AND collective_id = :'carol_collective') = 2,
  'a two-person Collective upholds without a vote, and abuse is penalised once');

\echo ''
\echo '--- settle functions are server-only (020) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2', 'SELECT settle_denouncements(24,24,100,50,3,150,60)'),
  'a member cannot call settle_denouncements');
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000b2',
    format('SELECT settle_assignments(%L, ''2026-09-14'', now())', :'alice_collective')),
  'a member cannot call settle_assignments');

\echo ''
\echo '--- collectives: reset_week is server-owned (020) ---'
SELECT assert(
  refused_as('00000000-0000-0000-0000-0000000000a1', 'UPDATE collectives SET reset_week = ''2030-01-01'''),
  'the founder cannot write reset_week');

\echo ''
\echo 'ALL RLS ASSERTIONS PASSED'
