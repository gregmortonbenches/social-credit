-- ============================================================
-- Social Credit — Migration 021: Collectives define their own tasks
--
-- A task is now an ACTION from a fixed list plus a SPACE the household types
-- themselves ("Mop" + "Kitchen", "Bins" + "Back garden"). Each collective owns
-- its tasks: rows with is_custom = true and created_by_collective_id set.
-- The ten shared default rows stay in place (past assignments and the RLS tests
-- point at them) but the app and auto-assign no longer read them.
--
--   action     one of the keys below; the app owns the labels
--   space      free text, 1-30 characters, whitespace collapsed
--   name       "Mop: Kitchen" — composed by trigger, so it cannot drift
--   room_type  lower(space) — what the room achievements group by
--   archived   how a member removes a task. Rows are never deleted because
--              weekly_assignments references them.
--
-- Any active member may add or archive their collective's tasks. 001 also let
-- any authenticated user insert a shared (is_custom = false) row; that is closed.
-- ============================================================

ALTER TABLE task_library
  ADD COLUMN IF NOT EXISTS action   text,
  ADD COLUMN IF NOT EXISTS space    text,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE task_library
  ADD CONSTRAINT task_library_action_check
    CHECK (action IS NULL OR action IN ('clean','mop','hoover','wash_up','tidy','bins')),
  ADD CONSTRAINT task_library_space_check
    CHECK (space IS NULL OR char_length(space) BETWEEN 1 AND 30),
  ADD CONSTRAINT task_library_custom_parts
    CHECK (NOT is_custom OR (action IS NOT NULL AND space IS NOT NULL
                             AND created_by_collective_id IS NOT NULL));

-- One live task per action + space in a collective ("Mop: kitchen" twice is noise).
CREATE UNIQUE INDEX IF NOT EXISTS task_library_collective_unique
  ON task_library (created_by_collective_id, action, lower(space))
  WHERE is_custom AND NOT archived;

CREATE OR REPLACE FUNCTION public.task_library_compose()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_custom THEN
    NEW.space := btrim(regexp_replace(NEW.space, '\s+', ' ', 'g'));
    NEW.name := CASE NEW.action
                  WHEN 'clean'   THEN 'Clean'
                  WHEN 'mop'     THEN 'Mop'
                  WHEN 'hoover'  THEN 'Hoover'
                  WHEN 'wash_up' THEN 'Wash up'
                  WHEN 'tidy'    THEN 'Tidy'
                  WHEN 'bins'    THEN 'Bins'
                END || ': ' || NEW.space;
    NEW.room_type := lower(NEW.space);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_library_compose ON task_library;
CREATE TRIGGER task_library_compose
  BEFORE INSERT OR UPDATE OF action, space ON task_library
  FOR EACH ROW EXECUTE FUNCTION public.task_library_compose();

-- Insert: only this collective's own tasks, as a member. Fills name/room_type via
-- the trigger, so the client sends just action + space.
DROP POLICY IF EXISTS "Members can insert custom tasks" ON task_library;
CREATE POLICY "Members can insert custom tasks"
  ON task_library FOR INSERT
  WITH CHECK (
    is_custom
    AND created_by_collective_id IN (SELECT get_user_collective_ids())
  );

-- Archive / restore. Column grant keeps every other field read-only.
DROP POLICY IF EXISTS "Members can archive custom tasks" ON task_library;
CREATE POLICY "Members can archive custom tasks"
  ON task_library FOR UPDATE
  USING (is_custom AND created_by_collective_id IN (SELECT get_user_collective_ids()))
  WITH CHECK (is_custom AND created_by_collective_id IN (SELECT get_user_collective_ids()));

REVOKE UPDATE ON task_library FROM authenticated;
GRANT UPDATE (archived) ON task_library TO authenticated;
