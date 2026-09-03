-- ============================================================
-- Social Credit — Migration 018: revoke PUBLIC execute on SECURITY DEFINER
--                                functions
--
-- CRITICAL. `001` ends with what looks like the right lockdown:
--
--   revoke execute on function credits_transaction from anon, authenticated;
--   grant  execute on function credits_transaction to service_role;
--
-- It does nothing. Postgres grants EXECUTE on every new function to PUBLIC by
-- default, and `anon` and `authenticated` never held a grant of their own to
-- revoke — they could already call it *through* PUBLIC. Revoking a privilege
-- someone does not directly hold is a no-op, and it fails silently.
--
-- The resulting ACL says so plainly, if you know to look. The leading `=X` is
-- PUBLIC:
--
--   {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--
-- So `credits_transaction` — SECURITY DEFINER, writes the ledger, sets
-- profiles.total_credits — has been callable by any signed-in user for the life
-- of the project. Verified against a local Postgres running the full chain: a
-- member called it directly and went from 500 credits to 1,000,499.
--
-- This invalidates three things that were believed true:
--   - SECURITY-FINDINGS.md called this function "correctly locked down".
--   - `award-task-credits` exists because the client supposedly cannot reach
--     the RPC. It could reach it all along.
--   - 014 stopped members forging `credits_value` to make award-task-credits
--     overpay. That was a real hole, but the shorter route was open too.
--
-- The functions added in 013, 014 and 016 are unaffected: they use
-- `REVOKE ALL ON FUNCTION ... FROM public, anon`, which does name PUBLIC.
-- ============================================================

-- The one that matters.
REVOKE ALL ON FUNCTION public.credits_transaction(uuid, uuid, int, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credits_transaction(uuid, uuid, int, text, uuid)
  TO service_role;

-- Scoped to auth.uid() internally so it leaks nothing, but there is no reason
-- for an anonymous caller to reach a SECURITY DEFINER function. RLS policies
-- call it as the querying role, so `authenticated` must keep EXECUTE.
REVOKE ALL ON FUNCTION public.get_user_collective_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_collective_ids() TO authenticated, service_role;

-- A trigger function. Triggers fire regardless of EXECUTE grants, so nothing
-- needs it; taking PUBLIC off removes a SECURITY DEFINER entry point that has
-- no legitimate caller.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
