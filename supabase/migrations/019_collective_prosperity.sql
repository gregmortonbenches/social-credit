-- ============================================================
-- Social Credit — Migration 019: Collective prosperity streak
--
-- The Collective page is about the household's prosperity across many weeks,
-- separate from anyone's weekly credits. A week counts only if EVERY duty was
-- completed (and no denouncement was upheld); a failed week sends the streak
-- back to zero. `weekly-reset` decides this at Monday 00:00 local time.
--
--   prosperity_streak  consecutive perfect weeks
--   prosperity_week    week_start of the last week evaluated — makes the hourly
--                      cron idempotent, so an extra run in the same hour cannot
--                      count a week twice
--
-- Both are server-owned. `005` granted UPDATE on the whole of `collectives`, and
-- the founder's UPDATE policy (`002`) has no column limit, so without the revoke
-- below the founder could simply write `prosperity_streak = 99` from the app —
-- the same shape as the `weekly_assignments` hole closed in `014`. Column-level
-- privileges are checked before any policy, so this cannot be reasoned around.
--
-- The only collective columns the client legitimately updates are the ones
-- below: the name (Settings), the timezone, and the room counts (Edit Rooms).
-- ============================================================

ALTER TABLE collectives
  ADD COLUMN IF NOT EXISTS prosperity_streak integer NOT NULL DEFAULT 0
    CHECK (prosperity_streak >= 0),
  ADD COLUMN IF NOT EXISTS prosperity_week date;

REVOKE UPDATE ON collectives FROM authenticated;
GRANT UPDATE (name, display_name, timezone, rooms) ON collectives TO authenticated;
