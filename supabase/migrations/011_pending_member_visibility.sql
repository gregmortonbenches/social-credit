-- Pending and paused members were invisible to the collective (and to themselves)
-- because the SELECT policies on collective_members and profiles required
-- status = 'active'. Mid-week joiners get status = 'pending' until Monday,
-- so they and their fellow members couldn't see each other at all.
-- Fix: allow any non-left member to read the collective's member list and profiles.

DROP POLICY IF EXISTS "Members can read their collective_members rows" ON collective_members;

CREATE POLICY "Members can read their collective_members rows"
  ON collective_members FOR SELECT
  USING (
    collective_id IN (
      SELECT collective_id FROM collective_members cm2
      WHERE cm2.user_id = auth.uid()
        AND cm2.status IN ('active', 'paused', 'pending')
    )
  );

DROP POLICY IF EXISTS "Members can read collective member profiles" ON profiles;

CREATE POLICY "Members can read collective member profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT user_id FROM collective_members
      WHERE collective_id IN (
        SELECT collective_id FROM collective_members cm2
        WHERE cm2.user_id = auth.uid()
          AND cm2.status IN ('active', 'paused', 'pending')
      )
    )
  );
