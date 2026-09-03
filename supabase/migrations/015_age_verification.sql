-- ============================================================
-- Social Credit — Migration 015: record that the age check happened
--
-- sign-up.tsx validates a date of birth against the 16+ gate and then discards
-- it: `signUp(email, password, username)` never receives it, and no column
-- exists to hold it. CLAUDE.md calls the age gate mandatory, but nothing in the
-- database showed a check had ever run — so there was no evidence of
-- compliance, and no way to tell a verified account from one created before the
-- gate existed.
--
-- Storing a full date of birth would mean holding more personal data than the
-- gate needs. A timestamp of when the check passed answers the compliance
-- question without retaining the date itself, so that is what is kept.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_verified_at timestamptz;

COMMENT ON COLUMN profiles.age_verified_at IS
  'When this account passed the 16+ date-of-birth check at sign-up. Null for '
  'accounts created before the check was recorded. The date of birth itself is '
  'deliberately not stored.';

-- Members can write their own flag (the client sets it immediately after the
-- check passes), but only their own row, and the column is not readable by
-- other members — the existing profiles SELECT policies already scope reads to
-- fellow collective members, which is acceptable for a timestamp.
GRANT UPDATE (age_verified_at) ON profiles TO authenticated;


-- ============================================================
-- Carry the flag through account creation
--
-- The profile row is created server-side by handle_new_user() (migration 002),
-- and with email confirmation enabled there is no client session at that moment
-- to write with. So the timestamp travels in the sign-up metadata and the
-- trigger copies it across, which also means it survives the confirmation
-- round-trip.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, total_credits, age_verified_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    500,
    (NEW.raw_user_meta_data->>'age_verified_at')::timestamptz
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
