-- ============================================================
-- Social Credit — Migration 016: denouncement write hardening + withdrawal
--
-- Same shape of hole as `014`, in the other direction. `005` granted UPDATE on
-- the whole denouncements table, and the accused's policy is USING-only:
--
--   CREATE POLICY "Accused can update own denouncement (submit explanation)"
--     ON denouncements FOR UPDATE
--     USING (accused_id = auth.uid() AND collective_id IN (...));
--
-- It was written so the accused can submit an explanation. With no WITH CHECK
-- and a table-wide grant, the accused can write any column of the row they are
-- accused in — including `outcome = 'dismissed'`, `status = 'resolved'` and
-- `resolved_at`. In other words, the accused can acquit themselves and close the
-- case before anyone votes.
--
-- Fixed the same way as 014: column privileges, which Postgres checks before any
-- policy runs. The accused may write only the three columns the explanation
-- flow needs, and the WITH CHECK pins the status they may move it to.
-- ============================================================


-- ============================================================
-- 1. The accused may respond, and nothing more
-- ============================================================

REVOKE UPDATE ON denouncements FROM authenticated;
GRANT UPDATE (explanation, status, responded_at) ON denouncements TO authenticated;

-- 'withdrawn' joins the state machine: a denouncement the accuser took back
-- before it was answered. The row is kept rather than deleted so the two-person
-- abuse counter still sees it — otherwise denounce-and-withdraw would be a way
-- to harass a housemate with no record and no penalty.
ALTER TABLE denouncements DROP CONSTRAINT IF EXISTS denouncements_status_check;
ALTER TABLE denouncements ADD CONSTRAINT denouncements_status_check
  CHECK (status IN ('open','responded','auto_guilty','voted','resolved','withdrawn'));

DROP POLICY IF EXISTS "Accused can update own denouncement (submit explanation)" ON denouncements;

CREATE POLICY "Accused can update own denouncement (submit explanation)"
  ON denouncements FOR UPDATE
  USING (
    accused_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
  )
  WITH CHECK (
    accused_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
    -- Responding is the only transition that belongs to the accused. Verdicts
    -- are reached by vote or by denounce-timeout, both service_role.
    AND status = 'responded'
  );


-- ============================================================
-- 2. Withdrawal
--
-- Denouncing is a one-tap public accusation against someone you live with,
-- carrying a credit penalty and a 24-hour clock, and there was no way to take it
-- back. Only the accuser, and only while the case is still `open` — once the
-- accused has answered, or it has gone to a vote or timed out, it is no longer
-- the accuser's alone to end.
--
-- No credits move: nothing has settled while a denouncement is open.
-- ============================================================

CREATE OR REPLACE FUNCTION public.withdraw_denouncement(p_denouncement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  SELECT status INTO v_status
  FROM denouncements
  WHERE id = p_denouncement_id AND accuser_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such denouncement' USING errcode = 'no_data_found';
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Only an unanswered denouncement can be withdrawn'
      USING errcode = '22023';
  END IF;

  UPDATE denouncements
  SET status = 'withdrawn', resolved_at = now()
  WHERE id = p_denouncement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_denouncement(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_denouncement(uuid) TO authenticated;
