-- ============================================================
-- 004 Fix infinite RLS recursion
-- The collective_members SELECT policy self-referenced
-- collective_members, causing infinite recursion whenever any
-- other policy also queried that table (e.g. profiles in 002).
-- Fix: SECURITY DEFINER function queries collective_members
-- without RLS, breaking the cycle. All membership-checking
-- policies are rebuilt to use this function.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_collective_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT collective_id FROM collective_members
  WHERE user_id = auth.uid() AND status = 'active';
$$;

-- collective_members
DROP POLICY IF EXISTS "Members can read their collective_members rows" ON collective_members;
CREATE POLICY "Members can read their collective_members rows"
  ON collective_members FOR SELECT
  USING (collective_id IN (SELECT get_user_collective_ids()));

-- collectives
DROP POLICY IF EXISTS "Members can read their collective" ON collectives;
CREATE POLICY "Members can read their collective"
  ON collectives FOR SELECT
  USING (id IN (SELECT get_user_collective_ids()));

DROP POLICY IF EXISTS "Members can update their collective" ON collectives;
DROP POLICY IF EXISTS "Creator can update their collective" ON collectives;
CREATE POLICY "Creator can update their collective"
  ON collectives FOR UPDATE
  USING (created_by = auth.uid());

-- profiles
DROP POLICY IF EXISTS "Members can read collective member profiles" ON profiles;
CREATE POLICY "Members can read collective member profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT user_id FROM collective_members
      WHERE collective_id IN (SELECT get_user_collective_ids())
    )
  );

-- weekly_assignments
DROP POLICY IF EXISTS "Members can read collective assignments" ON weekly_assignments;
CREATE POLICY "Members can read collective assignments"
  ON weekly_assignments FOR SELECT
  USING (collective_id IN (SELECT get_user_collective_ids()));

DROP POLICY IF EXISTS "Members can update own assignments" ON weekly_assignments;
CREATE POLICY "Members can update own assignments"
  ON weekly_assignments FOR UPDATE
  USING (
    user_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
  );

-- task_library
DROP POLICY IF EXISTS "Authenticated users can read task library" ON task_library;
CREATE POLICY "Authenticated users can read task library"
  ON task_library FOR SELECT
  USING (
    is_custom = false
    OR created_by_collective_id IN (SELECT get_user_collective_ids())
  );

DROP POLICY IF EXISTS "Members can insert custom tasks" ON task_library;
CREATE POLICY "Members can insert custom tasks"
  ON task_library FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      is_custom = false
      OR created_by_collective_id IN (SELECT get_user_collective_ids())
    )
  );

-- denouncements
DROP POLICY IF EXISTS "Members can read collective denouncements" ON denouncements;
CREATE POLICY "Members can read collective denouncements"
  ON denouncements FOR SELECT
  USING (collective_id IN (SELECT get_user_collective_ids()));

DROP POLICY IF EXISTS "Members can insert denouncements" ON denouncements;
CREATE POLICY "Members can insert denouncements"
  ON denouncements FOR INSERT
  WITH CHECK (
    accuser_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
  );

DROP POLICY IF EXISTS "Accused can update own denouncement (submit explanation)" ON denouncements;
CREATE POLICY "Accused can update own denouncement (submit explanation)"
  ON denouncements FOR UPDATE
  USING (
    accused_id = auth.uid()
    AND collective_id IN (SELECT get_user_collective_ids())
  );

-- denouncement_votes
DROP POLICY IF EXISTS "Members can read votes for their collective" ON denouncement_votes;
CREATE POLICY "Members can read votes for their collective"
  ON denouncement_votes FOR SELECT
  USING (
    denouncement_id IN (
      SELECT id FROM denouncements
      WHERE collective_id IN (SELECT get_user_collective_ids())
    )
  );

DROP POLICY IF EXISTS "Members can cast votes" ON denouncement_votes;
CREATE POLICY "Members can cast votes"
  ON denouncement_votes FOR INSERT
  WITH CHECK (
    voter_id = auth.uid()
    AND denouncement_id IN (
      SELECT id FROM denouncements
      WHERE collective_id IN (SELECT get_user_collective_ids())
    )
  );

-- draft_state
DROP POLICY IF EXISTS "Members can read draft state" ON draft_state;
CREATE POLICY "Members can read draft state"
  ON draft_state FOR SELECT
  USING (collective_id IN (SELECT get_user_collective_ids()));

DROP POLICY IF EXISTS "Members can update draft state (pick tasks)" ON draft_state;
DROP POLICY IF EXISTS "Active members can advance draft state" ON draft_state;
CREATE POLICY "Active members can advance draft state"
  ON draft_state FOR UPDATE
  USING (collective_id IN (SELECT get_user_collective_ids()));

-- credit_ledger
DROP POLICY IF EXISTS "Members can read own credit ledger" ON credit_ledger;
CREATE POLICY "Members can read own credit ledger"
  ON credit_ledger FOR SELECT
  USING (
    user_id = auth.uid()
    OR collective_id IN (SELECT get_user_collective_ids())
  );
