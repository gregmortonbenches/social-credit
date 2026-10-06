-- ============================================================
-- Social Credit — Migration 020: economy write hardening, atomic settlement
--
-- The same shape of hole as 014, 016 and 019, in the tables those migrations did
-- not reach. `005` granted blanket privileges to `authenticated`, and several
-- policies are USING-only or check nothing but the caller's role, so each of the
-- following was writable from the app with nothing but the public anon key and a
-- normal sign-in:
--
--   1. profiles            UPDATE: `total_credits`, `is_admin` (own row, any value)
--   2. weekly_assignments  INSERT: any row, any collective, any `credits_value`,
--                                  status 'complete' — then award-task-credits pays it
--                          DELETE: any assignment in the collective
--                          UPDATE: 'failed' -> 'complete', undoing a penalty
--   3. draft_state         INSERT/UPDATE: set the week 'complete' so auto-assign
--                                         skips the Collective for the week
--   4. denouncement_votes  INSERT: accused and accuser could vote on their own
--                                  case, and on one that was not up for a vote
--
-- Column privileges are checked before any policy, so the fixes below are
-- grants, not cleverer policies. All four tables keep SELECT.
--
-- It also makes money movement atomic and idempotent in the database rather than
-- in Edge Function code, because the functions did it as separate unchecked
-- calls: a status flipped to 'failed' and then the penalty rpc errored with
-- nothing logged, so the verdict stood and the credits never moved. See §6-§8.
-- ============================================================


-- ============================================================
-- 1. profiles: credits and the admin flag are server-owned
-- ============================================================

REVOKE INSERT, UPDATE ON profiles FROM authenticated;

-- INSERT is the sign-up fallback in useAuthStore (an account predating the
-- trigger). It may name only identity columns; `total_credits` takes its column
-- default (500 = CONFIG.STARTING_CREDITS) and `is_admin` stays false.
GRANT INSERT (id, username, email, age_verified_at) ON profiles TO authenticated;

-- 015 granted UPDATE (age_verified_at). That column is the compliance record
-- that the age check ran; it is written once, at sign-up, by the trigger.
REVOKE UPDATE (age_verified_at) ON profiles FROM authenticated;
GRANT UPDATE (username, device_push_token) ON profiles TO authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ============================================================
-- 2. weekly_assignments: written only by the server
-- ============================================================

REVOKE INSERT, DELETE ON weekly_assignments FROM authenticated;
DROP POLICY IF EXISTS "Service role can insert assignments" ON weekly_assignments;
DROP POLICY IF EXISTS "Members can delete pending assignments for their collective" ON weekly_assignments;

-- A member may tick a task off and undo that, and nothing else. `USING` now also
-- pins the row's *current* status: 014 limited what a row could become but not
-- what it had been, so a 'failed' row (penalty already taken) could be moved to
-- 'complete' and re-paid by award-task-credits.
DROP POLICY IF EXISTS "Members can update own assignments" ON weekly_assignments;
CREATE POLICY "Members can update own assignments"
  ON weekly_assignments FOR UPDATE
  USING (
    user_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
    AND status IN ('pending', 'complete')
  )
  WITH CHECK (
    user_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
    AND status IN ('pending', 'complete')
  );

-- Each task is handed to one member per week. A second auto-assign pass over the
-- same week (an overlapping cron tick, a retry after a half-finished run) now
-- fails instead of doubling the week. 'reassigned' rows are history, not duties.
CREATE UNIQUE INDEX IF NOT EXISTS weekly_assignments_task_once_per_week
  ON weekly_assignments (collective_id, task_id, week_start)
  WHERE status <> 'reassigned';


-- ============================================================
-- 3. draft_state: read-only to members
-- ============================================================

REVOKE INSERT, UPDATE ON draft_state FROM authenticated;
DROP POLICY IF EXISTS "Members can insert draft state" ON draft_state;
DROP POLICY IF EXISTS "Active members can advance draft state" ON draft_state;
DROP POLICY IF EXISTS "Members can update draft state (pick tasks)" ON draft_state;


-- ============================================================
-- 4. denouncement_votes: only a juror may vote, only while the case is out
-- ============================================================

DROP POLICY IF EXISTS "Members can cast votes" ON denouncement_votes;
CREATE POLICY "Members can cast votes"
  ON denouncement_votes FOR INSERT
  WITH CHECK (
    voter_id = auth.uid()
    AND denouncement_id IN (
      SELECT d.id
      FROM denouncements d
      WHERE d.collective_id IN (SELECT get_user_collective_ids())
        AND d.status = 'responded'
        AND d.accuser_id <> auth.uid()
        AND d.accused_id <> auth.uid()
    )
  );


-- ============================================================
-- 5. The weekly reset is idempotent per week
--
-- weekly-reset used to act only if the hourly cron happened to land in the
-- 00:00-00:59 local hour. One missed tick and the week was never settled and
-- no draft_state was created, so the Collective got no tasks. It now acts
-- whenever `reset_week` is behind the current week, and stamps it on success.
-- Server-owned like prosperity_week: 019 limits client UPDATE to four columns.
-- ============================================================

ALTER TABLE collectives ADD COLUMN IF NOT EXISTS reset_week date;

-- Existing Collectives are already settled up to this week. Without this the
-- first sweep after deploy would "reset" every one of them mid-week.
UPDATE collectives
SET reset_week = date_trunc('week', now() AT TIME ZONE timezone)::date
WHERE reset_week IS NULL;


-- ============================================================
-- 6. credits_transaction is idempotent
--
-- "Has this already been paid?" was a SELECT in the caller, then the call: two
-- concurrent callers both saw nothing and both paid. The ledger now refuses a
-- second row for the same (reference, reason, user), and the balance moves only
-- if the ledger row was actually written, in the same statement block.
-- Rows with no reference (none today) are not constrained.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_once_per_reference
  ON credit_ledger (reference_id, reason, user_id)
  WHERE reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.credits_transaction(
  p_user_id       uuid,
  p_collective_id uuid,
  p_delta         int,
  p_reason        text,
  p_reference_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_written int;
BEGIN
  INSERT INTO credit_ledger (user_id, collective_id, delta, reason, reference_id)
  VALUES (p_user_id, p_collective_id, p_delta, p_reason, p_reference_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written = 0 THEN
    RETURN;  -- already settled: do not move the balance a second time
  END IF;

  UPDATE profiles
  SET total_credits = total_credits + p_delta
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.credits_transaction(uuid, uuid, int, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credits_transaction(uuid, uuid, int, text, uuid)
  TO service_role;


-- ============================================================
-- 7. settle_assignments: fail what is overdue, pay what is done
--
-- One transaction per Collective-week. The status change and its ledger row
-- commit together or not at all, so a failed rpc can no longer leave a task
-- 'failed' with no penalty (the next run would skip it).
-- ============================================================

CREATE OR REPLACE FUNCTION public.settle_assignments(
  p_collective_id uuid,
  p_week_start    date,
  p_now           timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, user_id, credits_value
    FROM weekly_assignments
    WHERE collective_id = p_collective_id
      AND week_start = p_week_start
      AND status = 'pending'
      AND due_date < p_now
    FOR UPDATE
  LOOP
    UPDATE weekly_assignments SET status = 'failed' WHERE id = r.id;
    IF r.user_id IS NOT NULL AND coalesce(r.credits_value, 0) > 0 THEN
      PERFORM credits_transaction(r.user_id, p_collective_id, -r.credits_value, 'task_failed', r.id);
    END IF;
  END LOOP;

  -- Completed but not yet paid (the immediate award failed, e.g. offline).
  -- credits_transaction ignores the ones already in the ledger.
  FOR r IN
    SELECT id, user_id, credits_value
    FROM weekly_assignments
    WHERE collective_id = p_collective_id
      AND week_start = p_week_start
      AND status = 'complete'
  LOOP
    IF r.user_id IS NOT NULL AND coalesce(r.credits_value, 0) > 0 THEN
      PERFORM credits_transaction(r.user_id, p_collective_id, r.credits_value, 'task_complete', r.id);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_assignments(uuid, date, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_assignments(uuid, date, timestamptz) TO service_role;


-- ============================================================
-- 8. settle_denouncements: timeouts, votes, penalties, abuse rule
--
-- Nothing ever resolved a denouncement that was answered: the accused responded,
-- housemates voted, and the case sat in 'responded' forever with no verdict and
-- no credits moved. CLAUDE.md specifies the rules; this is the first
-- implementation of them.
--
--   open, past the response window          -> auto_guilty, upheld
--   responded, and either every juror has
--     voted or the vote window has passed   -> resolved; upheld iff uphold > dismiss
--                                             (a tie is dismissed)
--   responded, with nobody left to vote      -> upheld, no vote (the two-person rule)
--
--   upheld    accused -credits_value, accuser +reward
--   dismissed accuser -penalty
--
-- Jurors are the active members other than the two parties. The two-person
-- abuse rule: in a Collective of exactly two, `threshold` denouncements (withdrawn
-- ones included) within `window` days, counted from the last abuse penalty, cost
-- both members `abuse_penalty`.
--
-- The amounts and windows are arguments, not literals, because they are tunable
-- gameplay values that live in constants/config.ts; the Edge Function passes its
-- mirror of them. Each denouncement is settled in this one transaction, locked
-- with SKIP LOCKED, so a respond-vs-timeout race cannot settle it twice and a
-- failure rolls the status change back with the credits.
-- ============================================================

CREATE OR REPLACE FUNCTION public.settle_denouncements(
  p_response_hours     int,
  p_vote_hours         int,
  p_accuser_reward     int,
  p_accuser_penalty    int,
  p_abuse_threshold    int,
  p_abuse_penalty      int,
  p_abuse_window_days  int
)
RETURNS TABLE (
  o_id         uuid,
  o_accuser_id uuid,
  o_accused_id uuid,
  o_status     text,
  o_outcome    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d            record;
  v_status     text;
  v_outcome    text;
  v_jurors     int;
  v_up         int;
  v_down       int;
  v_active     int;
  v_recent     int;
BEGIN
  FOR d IN
    SELECT dn.id, dn.collective_id, dn.accuser_id, dn.accused_id, dn.status,
           dn.responded_at, wa.credits_value
    FROM denouncements dn
    LEFT JOIN weekly_assignments wa ON wa.id = dn.assignment_id
    WHERE (dn.status = 'open'
           AND dn.created_at < now() - make_interval(hours => p_response_hours))
       OR dn.status = 'responded'
    ORDER BY dn.created_at
    FOR UPDATE OF dn SKIP LOCKED
  LOOP
    IF d.status = 'open' THEN
      v_status  := 'auto_guilty';
      v_outcome := 'upheld';
    ELSE
      SELECT count(*) INTO v_jurors
      FROM collective_members m
      WHERE m.collective_id = d.collective_id
        AND m.status = 'active'
        AND m.user_id NOT IN (d.accuser_id, d.accused_id);

      SELECT count(*) FILTER (WHERE v.vote = 'uphold'),
             count(*) FILTER (WHERE v.vote = 'dismiss')
      INTO v_up, v_down
      FROM denouncement_votes v
      JOIN collective_members m
        ON m.user_id = v.voter_id
       AND m.collective_id = d.collective_id
       AND m.status = 'active'
      WHERE v.denouncement_id = d.id
        AND v.voter_id NOT IN (d.accuser_id, d.accused_id);

      IF v_jurors > 0
         AND (v_up + v_down) < v_jurors
         AND coalesce(d.responded_at, now()) > now() - make_interval(hours => p_vote_hours)
      THEN
        CONTINUE;  -- still waiting on votes
      END IF;

      v_status  := 'resolved';
      v_outcome := CASE
        WHEN v_jurors = 0 THEN 'upheld'
        WHEN v_up > v_down THEN 'upheld'
        ELSE 'dismissed'
      END;
    END IF;

    UPDATE denouncements
    SET status = v_status, outcome = v_outcome, resolved_at = now()
    WHERE id = d.id;

    IF v_outcome = 'upheld' THEN
      IF coalesce(d.credits_value, 0) > 0 THEN
        PERFORM credits_transaction(
          d.accused_id, d.collective_id, -d.credits_value,
          CASE WHEN v_status = 'auto_guilty'
               THEN 'denouncement_auto_guilty'
               ELSE 'denouncement_upheld_deduction' END,
          d.id);
      END IF;
      PERFORM credits_transaction(
        d.accuser_id, d.collective_id, p_accuser_reward, 'denouncement_upheld_reward', d.id);
    ELSE
      PERFORM credits_transaction(
        d.accuser_id, d.collective_id, -p_accuser_penalty, 'denouncement_dismissed_penalty', d.id);
    END IF;

    -- Two-person abuse rule.
    SELECT count(*) INTO v_active
    FROM collective_members
    WHERE collective_id = d.collective_id AND status = 'active';

    IF v_active = 2 THEN
      SELECT count(*) INTO v_recent
      FROM denouncements
      WHERE collective_id = d.collective_id
        AND created_at > now() - make_interval(days => p_abuse_window_days)
        AND created_at > coalesce(
          (SELECT max(created_at) FROM credit_ledger
           WHERE collective_id = d.collective_id
             AND reason = 'denouncement_abuse_penalty'),
          '-infinity'::timestamptz);

      IF v_recent >= p_abuse_threshold THEN
        PERFORM credits_transaction(
          d.accuser_id, d.collective_id, -p_abuse_penalty, 'denouncement_abuse_penalty', d.id);
        PERFORM credits_transaction(
          d.accused_id, d.collective_id, -p_abuse_penalty, 'denouncement_abuse_penalty', d.id);
      END IF;
    END IF;

    o_id := d.id;
    o_accuser_id := d.accuser_id;
    o_accused_id := d.accused_id;
    o_status := v_status;
    o_outcome := v_outcome;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_denouncements(int, int, int, int, int, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_denouncements(int, int, int, int, int, int, int)
  TO service_role;
