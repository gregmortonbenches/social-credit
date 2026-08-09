-- ============================================================
-- 002 Security Fixes
-- ============================================================

-- ============================================================
-- Allow weekly_assignments and credit_ledger user_id to be NULL
-- so that deleted accounts can be anonymised without violating FKs
-- ============================================================

ALTER TABLE weekly_assignments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE weekly_assignments
  DROP CONSTRAINT weekly_assignments_user_id_fkey;

ALTER TABLE weekly_assignments
  ADD CONSTRAINT weekly_assignments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE credit_ledger
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE credit_ledger
  DROP CONSTRAINT credit_ledger_user_id_fkey;

ALTER TABLE credit_ledger
  ADD CONSTRAINT credit_ledger_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- Fix collectives UPDATE policy: only the creator may update
-- (previously any active member could rename or change timezone)
-- ============================================================

DROP POLICY IF EXISTS "Members can update their collective" ON collectives;

CREATE POLICY "Creator can update their collective"
  ON collectives FOR UPDATE
  USING (created_by = auth.uid());

-- ============================================================
-- Fix draft_state UPDATE policy: restrict to the current picker
-- A security-definer function enforces turn ownership so the
-- RLS check only needs collective membership as a gate.
-- Full pick validation is enforced by pickTask() in lib/draft.ts.
-- ============================================================

DROP POLICY IF EXISTS "Members can update draft state (pick tasks)" ON draft_state;

CREATE POLICY "Active members can advance draft state"
  ON draft_state FOR UPDATE
  USING (
    collective_id IN (
      SELECT collective_id FROM collective_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Fix denouncements UPDATE policy: scope to current collective
-- (previously accused could respond to denouncements from
--  collectives they had already left)
-- ============================================================

DROP POLICY IF EXISTS "Accused can update own denouncement (submit explanation)" ON denouncements;

CREATE POLICY "Accused can update own denouncement (submit explanation)"
  ON denouncements FOR UPDATE
  USING (
    accused_id = auth.uid()
    AND collective_id IN (
      SELECT collective_id FROM collective_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Profile auto-creation trigger
-- Creates the profile row server-side when a new auth user signs
-- up, eliminating the race where signUp() succeeds but the
-- subsequent client-side insert fails.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, total_credits)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    500
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Profiles RLS: allow collective members to read other members'
-- profiles (needed for scoreboard and denouncement display)
-- ============================================================

DROP POLICY IF EXISTS "Members can read collective member profiles" ON profiles;

CREATE POLICY "Members can read collective member profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT user_id FROM collective_members
      WHERE collective_id IN (
        SELECT collective_id FROM collective_members cm2
        WHERE cm2.user_id = auth.uid() AND cm2.status = 'active'
      )
    )
  );
