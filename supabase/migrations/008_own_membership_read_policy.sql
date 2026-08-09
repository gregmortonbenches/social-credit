-- Allow users to always read their own collective_members row.
-- The existing policy only grants access via collective_id (which requires
-- active status), creating a bootstrap problem: pending members and the
-- initial app-open lookup can't discover which collective they belong to.
CREATE POLICY "Users can read own membership"
  ON collective_members FOR SELECT
  USING (user_id = auth.uid());
