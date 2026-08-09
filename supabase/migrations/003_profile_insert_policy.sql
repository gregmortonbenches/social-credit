-- ============================================================
-- 003 Profile insert policy
-- Allows authenticated users to create their own profile row.
-- Needed as a fallback when the on_auth_user_created trigger
-- (migration 002) hasn't fired yet — e.g. accounts created before
-- the trigger existed, or a rare race condition on first sign-in.
-- ============================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());
