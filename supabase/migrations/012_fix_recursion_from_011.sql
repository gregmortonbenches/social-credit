-- Migration 011 broke the collective_members SELECT policy by using a direct
-- self-referencing subquery instead of the SECURITY DEFINER function, reintroducing
-- the infinite recursion that migration 004 had fixed.
--
-- Fix:
--   1. Update get_user_collective_ids() to include pending/paused (the intent of 011)
--   2. Restore collective_members SELECT policy to use the safe SECURITY DEFINER function
--   3. Rewrite profiles policy to also use get_user_collective_ids() (avoids nested recursion
--      from the double collective_members subquery that 011 introduced there too)

CREATE OR REPLACE FUNCTION public.get_user_collective_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT collective_id FROM collective_members
  WHERE user_id = auth.uid() AND status IN ('active', 'paused', 'pending');
$$;

DROP POLICY IF EXISTS "Members can read their collective_members rows" ON collective_members;

CREATE POLICY "Members can read their collective_members rows"
  ON collective_members FOR SELECT
  USING (collective_id IN (SELECT get_user_collective_ids()));

DROP POLICY IF EXISTS "Members can read collective member profiles" ON profiles;

CREATE POLICY "Members can read collective member profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT user_id FROM collective_members
      WHERE collective_id IN (SELECT get_user_collective_ids())
    )
  );
