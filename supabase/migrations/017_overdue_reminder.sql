-- ============================================================
-- Social Credit — Migration 017: overdue reminder guard
--
-- Supports the `overdue-reminder` cron. Without a marker, an hourly sweep would
-- push "A task is overdue, Comrade" about the same chore every hour until the
-- Monday reset — the fastest way to get notifications turned off entirely.
--
-- Not client-writable: `014` limits members to (status, completed_at), and this
-- column is the cron's bookkeeping, not theirs.
-- ============================================================

ALTER TABLE weekly_assignments
  ADD COLUMN IF NOT EXISTS notified_overdue_at timestamptz;

COMMENT ON COLUMN weekly_assignments.notified_overdue_at IS
  'When the overdue-reminder cron pushed about this assignment. Null means not '
  'yet warned. Cleared implicitly each week because assignments are per-week rows.';

-- Rescheduling moves the deadline, so a task warned about at its old date should
-- be eligible to warn again if it goes overdue at the new one.
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

  v_due := (p_due_day::text || ' 23:59:00')::timestamp AT TIME ZONE v_timezone;

  UPDATE weekly_assignments
  SET due_date = v_due, notified_overdue_at = NULL
  WHERE id = p_assignment_id;

  RETURN v_due;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_assignment(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_assignment(uuid, date) TO authenticated;
