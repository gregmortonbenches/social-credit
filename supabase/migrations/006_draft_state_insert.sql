-- ============================================================
-- 006 Allow members to insert draft_state
-- In production the weekly-reset Edge Function (service role)
-- creates draft_state rows. This policy also allows collective
-- members to insert, which is needed for the dev test draft button.
-- ============================================================

GRANT INSERT ON public.draft_state TO authenticated;

DROP POLICY IF EXISTS "Members can insert draft state" ON draft_state;

CREATE POLICY "Members can insert draft state"
  ON draft_state FOR INSERT
  WITH CHECK (collective_id IN (SELECT get_user_collective_ids()));
