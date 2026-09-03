-- ============================================================
-- Social Credit — Migration 013: Collective join hardening
--
-- Closes the join-flow authorization hole documented in SECURITY-FINDINGS.md §1.
--
-- Before this migration, two policies combined badly:
--
--   * 010 let any authenticated user `select *` from `collectives`, returning
--     every collective in the database — names and join codes included.
--   * 001's "Users can insert themselves as member" checked only that the row
--     being inserted was your own `user_id`. It did not check the join code and
--     did not constrain `status`, so a user could insert themselves as 'active'
--     into any collective_id.
--
--   Chained, that is: read every join code -> insert yourself as an active
--   member of any household -> full read/write access to their tasks,
--   denouncements, scoreboards and credit ledger, since all of those RLS
--   policies key off active membership.
--
-- The join code was only ever enforced in `app/(app)/collective/join.tsx`.
-- Client-side checks are not access control: the anon key ships inside the app
-- bundle, so anyone can call PostgREST directly and skip the screen entirely.
--
-- Fix: `collectives` becomes readable only by its own members, and every
-- membership transition moves behind a SECURITY DEFINER function that performs
-- the check the client used to be trusted with. `collective_members` is no
-- longer directly writable from the client at all.
-- ============================================================


-- ============================================================
-- 1. collectives is no longer world-readable
-- ============================================================

-- 010 granted blanket SELECT so that (a) a non-member could look up a
-- collective by code before joining and (b) collective creation could check for
-- code collisions. Both needs are now served by the functions below, so the
-- blanket policy goes.
DROP POLICY IF EXISTS "Authenticated users can look up any collective" ON collectives;

-- 001's own policy required status = 'active', which locked out pending and
-- paused members. Use the SECURITY DEFINER helper (see 004/012) so the status
-- set stays consistent with every other policy and cannot recurse.
DROP POLICY IF EXISTS "Members can read their collective" ON collectives;

CREATE POLICY "Members can read their collective"
  ON collectives FOR SELECT
  USING (id IN (SELECT get_user_collective_ids()));

-- Collectives are created only via create_collective() below, which runs as
-- definer and inserts the creator's membership row in the same transaction.
DROP POLICY IF EXISTS "Authenticated users can insert a collective" ON collectives;


-- ============================================================
-- 2. collective_members is no longer directly writable
--
-- Every legitimate transition is one of the five functions below. Dropping the
-- INSERT and UPDATE policies means a client cannot forge a membership row or
-- promote its own status, whatever it sends to PostgREST.
-- ============================================================

DROP POLICY IF EXISTS "Users can insert themselves as member" ON collective_members;
DROP POLICY IF EXISTS "Users can update own membership" ON collective_members;


-- ============================================================
-- 3. Pre-join lookup
--
-- Returns at most one row, and only for an exact code match, so the table stays
-- unreadable in bulk. Deliberately does NOT return the code back to the caller.
--
-- NOTE: a 5-digit code is a 100,000-value space and is brute-forceable by a
-- determined caller. This function is the only remaining way to probe it, so it
-- is the right place to add rate limiting or logging if this ever goes
-- commercial. See SECURITY-FINDINGS.md §1 for the residual-risk note.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lookup_collective_by_code(p_code text)
RETURNS TABLE (id uuid, name text, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.id, c.name, c.display_name
  FROM collectives c
  WHERE c.code = p_code
  LIMIT 1;
$$;


-- ============================================================
-- 4. Join by code
--
-- The join code is the capability: possession of it is what authorises the
-- insert, and that is now checked in the database rather than in the client.
--
-- Status follows the documented mid-week join rule (CLAUDE.md): a member who
-- joins on a Monday is active immediately, anyone else is pending until
-- weekly-reset promotes them. The day is computed in the COLLECTIVE's timezone,
-- not the caller's device timezone — collective timezone is the source of truth
-- for all scheduling.
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_collective_by_code(p_code text)
RETURNS collectives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_collective collectives;
  v_existing   text;
  v_status     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  SELECT * INTO v_collective FROM collectives WHERE code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collective not found' USING errcode = 'no_data_found';
  END IF;

  SELECT status INTO v_existing
  FROM collective_members
  WHERE collective_id = v_collective.id AND user_id = v_uid;

  -- Already in this collective and not departed: idempotent no-op.
  IF v_existing IS NOT NULL AND v_existing <> 'left' THEN
    RETURN v_collective;
  END IF;

  IF extract(isodow FROM (now() AT TIME ZONE v_collective.timezone)) = 1 THEN
    v_status := 'active';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO collective_members (collective_id, user_id, status)
  VALUES (v_collective.id, v_uid, v_status)
  ON CONFLICT (collective_id, user_id) DO UPDATE
    SET status           = excluded.status,
        joined_at        = now(),
        pause_started_at = NULL,
        pause_ended_at   = NULL;

  RETURN v_collective;
END;
$$;


-- ============================================================
-- 5. Create a collective
--
-- Generates the code, inserts the collective and enrols the creator as active
-- in one transaction. Doing this in the database also removes a race in the old
-- client-side code, which SELECTed to check for a code collision and then
-- INSERTed — two callers could pass the check with the same candidate.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_collective(
  p_name     text,
  p_timezone text,
  p_rooms    jsonb DEFAULT '{}'::jsonb
)
RETURNS collectives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_collective collectives;
  v_code       char(5);
  v_attempts   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Collective name is required' USING errcode = '22023';
  END IF;

  -- Guard the timezone here: every scheduled job resolves the collective's
  -- local time from this string, so an invalid one silently breaks the weekly
  -- loop for that collective rather than failing at creation.
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Invalid timezone: %', p_timezone USING errcode = '22023';
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    v_code := lpad((floor(random() * 100000))::int::text, 5, '0');

    BEGIN
      INSERT INTO collectives (name, display_name, code, timezone, created_by, rooms)
      VALUES (btrim(p_name), btrim(p_name) || ' Collective', v_code, p_timezone, v_uid,
              coalesce(p_rooms, '{}'::jsonb))
      RETURNING * INTO v_collective;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 50 THEN
        RAISE EXCEPTION 'Could not generate a unique collective code';
      END IF;
    END;
  END LOOP;

  INSERT INTO collective_members (collective_id, user_id, status)
  VALUES (v_collective.id, v_uid, 'active');

  RETURN v_collective;
END;
$$;


-- ============================================================
-- 6. Membership state transitions
--
-- Each function checks the CURRENT status before writing, which a WITH CHECK
-- clause cannot do — WITH CHECK sees only the proposed row, never the existing
-- one. That is why these are functions rather than a tightened UPDATE policy:
-- without the old-status check, a pending member could set themselves 'paused'
-- and then resume straight to 'active', skipping the Monday wait.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pause_membership(p_collective_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  UPDATE collective_members
  SET status = 'paused', pause_started_at = now(), pause_ended_at = NULL
  WHERE collective_id = p_collective_id
    AND user_id = v_uid
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active membership to pause' USING errcode = 'no_data_found';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.resume_membership(p_collective_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  UPDATE collective_members
  SET status = 'active', pause_ended_at = now()
  WHERE collective_id = p_collective_id
    AND user_id = v_uid
    AND status = 'paused';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No paused membership to resume' USING errcode = 'no_data_found';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.leave_collective(p_collective_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;

  UPDATE collective_members
  SET status = 'left'
  WHERE collective_id = p_collective_id
    AND user_id = v_uid
    AND status <> 'left';
END;
$$;


-- ============================================================
-- 7. Grants
--
-- These functions are the client's only route to collective membership, so
-- `authenticated` needs EXECUTE. Nothing here is for anonymous callers.
-- ============================================================

REVOKE ALL ON FUNCTION public.lookup_collective_by_code(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.join_collective_by_code(text)   FROM public, anon;
REVOKE ALL ON FUNCTION public.create_collective(text, text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.pause_membership(uuid)  FROM public, anon;
REVOKE ALL ON FUNCTION public.resume_membership(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.leave_collective(uuid)  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.lookup_collective_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_collective_by_code(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_collective(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_membership(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_collective(uuid)  TO authenticated;
