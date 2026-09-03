GRANT DELETE ON TABLE weekly_assignments TO authenticated;

-- NOTE: this must be `IN (SELECT ...)`, not `= ANY(...)`.
-- get_user_collective_ids() RETURNS SETOF uuid, and Postgres rejects a
-- set-returning function called directly in a policy expression
-- ("set-returning functions are not allowed in policy expressions"). Wrapping it
-- in a subquery is the form every other policy in this schema uses.
CREATE POLICY "Members can delete pending assignments for their collective"
  ON weekly_assignments FOR DELETE
  USING (collective_id IN (SELECT get_user_collective_ids()));
