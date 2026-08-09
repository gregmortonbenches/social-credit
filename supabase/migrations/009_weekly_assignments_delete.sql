GRANT DELETE ON TABLE weekly_assignments TO authenticated;

CREATE POLICY "Members can delete pending assignments for their collective"
  ON weekly_assignments FOR DELETE
  USING (collective_id = ANY(get_user_collective_ids()));
