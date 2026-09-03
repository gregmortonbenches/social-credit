# Security findings

Audit of the code in this repo, August 2026; revisited September 2026, when the
outstanding item was fixed. Everything below is now addressed in code — see the
residual-risk note under §1 for the one thing that still needs a judgement call.

---

## 1. FIXED — Any user could join any collective

**Severity: high.**

Two policies combined badly.

```sql
-- 010_collective_public_lookup.sql
CREATE POLICY "Authenticated users can look up any collective"
  ON collectives FOR SELECT
  USING (auth.uid() IS NOT NULL);        -- no filter at all

-- 001_initial_schema.sql
create policy "Users can insert themselves as member"
  on collective_members for insert
  with check (user_id = auth.uid());     -- only checks it is *you*
```

The first let any signed-up user `select *` from `collectives` and read **every
collective in the database** — names and join codes included. The migration's own
comment assumed "the 5-digit join code provides sufficient access control for
discovery", but the policy never filtered by code, so no guessing was needed.

The second let a user insert themselves into **any** `collective_id`, with no
check that they knew the join code and — critically — no constraint on `status`.
They could insert themselves directly as `'active'`.

The join code was enforced only in `app/(app)/collective/join.tsx`. Client-side
checks are not access control; anyone can call PostgREST directly with the anon
key, which ships inside the app.

Chained: read every collective → insert yourself as active in any of them. Since
the RLS on tasks, denouncements and scoreboards keys off "is an active member of
this collective", that granted full read/write into any household's data.

### The fix — `013_collective_join_hardening.sql`

`collectives` is no longer world-readable, and `collective_members` is no longer
writable from the client at all. Every membership transition now goes through a
`SECURITY DEFINER` function that performs the check the client used to be
trusted with:

| Function | Replaces | Checks |
|---|---|---|
| `lookup_collective_by_code(code)` | blanket SELECT on `collectives` | exact code match, returns at most one row, never returns the code back |
| `join_collective_by_code(code)` | client-side `INSERT` into `collective_members` | possession of the join code; sets `status` itself |
| `create_collective(name, tz, rooms)` | client-side code generation + two INSERTs | authenticated caller; valid IANA timezone |
| `pause_membership(id)` / `resume_membership(id)` / `leave_collective(id)` | client-side `UPDATE` of `status` | the **current** status before writing |

Three things worth noting about the shape of the fix:

- **Why functions rather than a tightened `WITH CHECK`.** A `WITH CHECK` clause
  sees only the proposed row, never the existing one, so it cannot express "you
  may go from paused to active but not from pending to active". Without that
  distinction a pending member could set themselves `paused` and immediately
  resume to `active`, skipping the Monday wait. The transition functions compare
  against the current status, which a policy cannot do.

- **The status decision moved server-side and into the right timezone.** The old
  client code used `now.getDay() === 1` — the *device's* day of week. CLAUDE.md
  makes the collective's timezone the source of truth for all scheduling, so the
  RPC now computes the day in the collective's timezone.

- **`weekly-reset` now promotes pending members.** It never did, so a mid-week
  joiner stayed `pending` forever: visible to the collective, but skipped by
  `auto-assign`, so never given a task. That was already a bug; it becomes a
  blocking one once every non-Monday join is `pending`, which is why it is
  fixed here.

### Residual risk — the code space is small

A 5-digit code is 100,000 values and is brute-forceable by a determined caller.
`lookup_collective_by_code` is now the only way to probe it, so it is the right
chokepoint for rate limiting or logging, but **neither is implemented**.

Lengthening `CONFIG.COLLECTIVE_CODE_LENGTH` would invalidate every existing
collective's code, so that is a product decision rather than something to change
quietly in a security pass. Left as-is deliberately.

---

## 2. FIXED — Cron Edge Functions had no caller authentication

The cron functions ran with the service role and accepted any caller.
`verify_jwt` only proves the caller holds *a* valid key, and the anon key ships
in the app, so any user could invoke them. `auto-assign` was worst: it accepts
`{"force": true}` to skip its schedule and run assignment for every collective
immediately.

Fixed by `supabase/functions/_shared/cron-auth.ts`, required by all of them.

**Deployment:** the scheduler must now send
`Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. If it currently uses the
anon key these return 401 and the weekly loop stops. See
`supabase/functions/README.md`.

Note this also disables the `__DEV__`-only "Force Assign Tasks" button in
Settings, which invoked `auto-assign` with the user's session. That is the
correct trade: the button was the exact capability the guard exists to remove.

---

## 3. FIXED — Age gate accepted impossible dates

`new Date(2000, 1, 31)` rolls over to 2 March rather than returning `NaN`, so
`isNaN` alone accepted `31-02-2000`. Now the parsed parts are compared back to
what was typed.

Note the rollover always moved the date *later*, i.e. made the user look
*younger*, so it could not be used to slip past the 16+ check.

---

## 4. FIXED — Two migrations could never have been applied

Found while verifying §1 against a real Postgres. Neither is a vulnerability,
but both meant `supabase/migrations/` could not be run end-to-end on a fresh
database, so a new environment could not be brought up at all — and any fix
shipped as a migration could not land.

- **`001_initial_schema.sql`** created a policy on `collectives` that references
  `collective_members` around 25 lines before that table is created. A policy
  expression is parsed at `CREATE POLICY` time, so this errored. The two
  affected policies now sit after the table they depend on. No semantic change.

- **`009_weekly_assignments_delete.sql`** used
  `collective_id = ANY(get_user_collective_ids())`. That function returns
  `SETOF uuid`, and Postgres rejects a set-returning function called directly in
  a policy expression. Rewritten as `IN (SELECT ...)`, the form every other
  policy in the schema uses.

Because 009 never applied, **an existing project is probably missing the DELETE
grant and policy on `weekly_assignments`**. Re-run 009 there.

The full chain 001 → 013 now applies cleanly to an empty database.

---

## 5. FIXED — Credits were never awarded on completion

`credits_transaction` is correctly locked down
(`revoke execute ... from anon, authenticated`) — that is why the client-side
award in `useTaskStore` always failed. Credits were settled only by
`weekly-reset`, so a completed task showed no credit change until Monday. The
"fallback" was in fact the only path.

Fixed by the `award-task-credits` Edge Function, which authenticates the caller,
re-reads the assignment to confirm they own it and that it is genuinely
complete, takes the amount from the row rather than the request body, and is
idempotent against the ledger. The grant on `credits_transaction` is unchanged.

---

## Related, not a vulnerability

**The date of birth is discarded.** `sign-up.tsx` validates it and then calls
`signUp(email, password, username)` — the DOB is never passed on, and no
`date_of_birth` column exists in any migration. So nothing records that the
check happened. `CLAUDE.md` calls the age gate mandatory; if this ever goes
commercial you would have no evidence of compliance. Storing a full DOB is
extra PII, so an `age_verified_at timestamptz` on `profiles` may be the better
trade — worth a deliberate decision either way.

**The other `lib/credits.ts` helpers cannot work from the client.**
`deductTaskCredits`, `awardDenounceReward`, `deductDenounceAccuserPenalty`,
`deductAccusedCredits` and `applyTwoPersonAbusePenalty` all call
`credits_transaction` directly, so they would fail the same way
`awardTaskCredits` did. None of them has a client call site today — the
denouncement payouts they describe are made by the `denounce-timeout` Edge
Function — so nothing is broken. They are a trap for whoever wires them up
next, and are commented as such.
