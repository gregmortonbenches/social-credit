-- ============================================================
-- Social Credit — Migration 014: Assignment write hardening + rescheduling
--
-- Two problems, one cause. `001`'s update policy on weekly_assignments (as
-- rewritten by `004`) has a USING clause but no WITH CHECK:
--
--   CREATE POLICY "Members can update own assignments"
--     ON weekly_assignments FOR UPDATE
--     USING (user_id = auth.uid() AND collective_id IN (...));
--
-- USING vets the row you are allowed to touch. It says nothing about what you
-- may turn it into, and `005` granted UPDATE on the whole table. So a member
-- could rewrite any column of their own assignment:
--
--   1. Forge the economy. `award-task-credits` deliberately reads the payout
--      from `credits_value` on the row instead of trusting the request body —
--      but the row is client-writable, so `SET credits_value = 100000,
--      status = 'complete'` then invoking the function pays out 100,000
--      credits. Verified against a local Postgres with the full chain applied.
--   2. Dodge the penalty. `weekly-reset` only fails assignments whose
--      `due_date < now`, so `SET due_date = '2030-01-01'` escapes it forever.
--
-- The fix is column-level privileges rather than more policy logic: Postgres
-- refuses the write before any policy is consulted, and it cannot be reasoned
-- around. Members may set only `status` and `completed_at` — ticking a task off
-- and undoing that. Everything else, `due_date` included, is server-owned.
--
-- Rescheduling (which members legitimately need) therefore goes through an RPC,
-- the same shape as the membership transitions in `013`.
-- ============================================================


-- ============================================================
-- 1. Members may write only the two columns that are theirs to write
-- ============================================================

REVOKE UPDATE ON weekly_assignments FROM authenticated;
GRANT UPDATE (status, completed_at) ON weekly_assignments TO authenticated;

-- Defence in depth: if a later migration widens the column grant again, the
-- policy still pins the row to the caller and refuses forged terminal states.
-- 'failed' and 'reassigned' are settlement outcomes and belong to the cron
-- functions, which run as service_role and bypass RLS entirely.
DROP POLICY IF EXISTS "Members can update own assignments" ON weekly_assignments;

CREATE POLICY "Members can update own assignments"
  ON weekly_assignments FOR UPDATE
  USING (
    user_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
    AND status IN ('pending', 'complete')
  );


-- ============================================================
-- 2. Rescheduling
--
-- Members pick which day they will do each of their tasks. auto-assign spreads
-- them across the week as a sensible default; this lets a member move one.
--
-- Deliberately permissive about clustering: several tasks on one day is fine,
-- and is a normal way to use a Saturday. The only hard bounds are that the day
-- stays inside the assignment's own week — otherwise a task outlives the
-- Monday reset that settles it — and that the task is still outstanding.
--
-- The 23:59 end-of-day mirrors DEFAULT_TASK_DUE_HOUR / _MINUTE in
-- constants/config.ts. Like the Edge Functions, this cannot import from the
-- app's source tree, so the values are repeated here; keep them in step.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reschedule_assignment(
  p_assignment_id uuid,
  p_due_day       date
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_week_start date;
  v_status     text;
  v_timezone   text;
  v_due        timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  SELECT wa.week_start, wa.status, c.timezone
    INTO v_week_start, v_status, v_timezone
  FROM weekly_assignments wa
  JOIN collectives c ON c.id = wa.collective_id
  WHERE wa.id = p_assignment_id
    AND wa.user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such assignment' USING errcode = 'no_data_found';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only an outstanding task can be rescheduled'
      USING errcode = '22023';
  END IF;

  IF p_due_day < v_week_start OR p_due_day > v_week_start + 6 THEN
    RAISE EXCEPTION 'A task must stay within its own week (% to %)',
      v_week_start, v_week_start + 6 USING errcode = '22023';
  END IF;

  -- 23:59 local to the collective, not to whoever's phone is asking.
  v_due := (p_due_day::text || ' 23:59:00')::timestamp AT TIME ZONE v_timezone;

  UPDATE weekly_assignments SET due_date = v_due WHERE id = p_assignment_id;

  RETURN v_due;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_assignment(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_assignment(uuid, date) TO authenticated;
