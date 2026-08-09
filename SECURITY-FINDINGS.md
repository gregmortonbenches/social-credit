# Security findings

Audit of the code in this repo, August 2026. Two issues are fixed in code here;
one needs a database migration and a client change, and is **not** fixed — it
needs coordinating with whoever owns the live Supabase project.

---

## 1. UNFIXED — Any user can join any collective

**Severity: high.** This is the one to act on.

Two policies in `001_initial_schema.sql` combine badly.

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

The first lets any signed-up user `select *` from `collectives` and read **every
collective in the database** — names and join codes included. The migration's own
comment assumes "the 5-digit join code provides sufficient access control for
discovery", but the policy never filters by code, so no guessing is needed.

The second lets a user insert themselves into **any** `collective_id`, with no
check that they know the join code and — critically — no constraint on `status`.
They can insert themselves directly as `'active'`.

The join code is enforced only in `app/(app)/collective/join.tsx`. Client-side
checks are not access control; anyone can call PostgREST directly with the anon
key, which ships inside the app.

Chained: read every collective → insert yourself as active in any of them. Since
the RLS on tasks, denouncements and scoreboards keys off "is an active member of
this collective", that grants full read/write into any household's data.

### Suggested fix

Not applied, because it changes the join flow and needs a matching client change.

1. Replace the blanket SELECT policy with membership-scoped access:
   ```sql
   DROP POLICY "Authenticated users can look up any collective" ON collectives;

   CREATE POLICY "Members can read their own collectives"
     ON collectives FOR SELECT
     USING (
       id IN (SELECT collective_id FROM collective_members
              WHERE user_id = auth.uid() AND status <> 'left')
     );
   ```

2. Add a `security definer` RPC for pre-join lookup, so a code returns exactly
   one row and the table stays unreadable in bulk:
   ```sql
   CREATE FUNCTION lookup_collective_by_code(p_code text)
   RETURNS TABLE (id uuid, name text)
   LANGUAGE sql SECURITY DEFINER AS $$
     SELECT id, name FROM collectives WHERE invite_code = p_code LIMIT 1;
   $$;
   ```
   Rate-limit or log this — a 5-digit space is only 100,000 codes and is
   brute-forceable. Consider lengthening the code.

3. Constrain self-insert so a user cannot self-activate:
   ```sql
   DROP POLICY "Users can insert themselves as member" ON collective_members;

   CREATE POLICY "Users can request to join"
     ON collective_members FOR INSERT
     WITH CHECK (user_id = auth.uid() AND status = 'pending');
   ```
   `useCollectiveStore.joinCollective` currently inserts `'active'` on Mondays,
   so it must be changed to always insert `'pending'`, with an existing member
   promoting them. Note `"Users can update own membership"` is
   `using (user_id = auth.uid())` with no `WITH CHECK`, so a user could also
   `update` their own row to `'active'` — that policy needs a `WITH CHECK` too.

---

## 2. FIXED — Cron Edge Functions had no caller authentication

`auto-assign`, `weekly-reset`, `draft-timeout` and `denounce-timeout` ran with
the service role and accepted any caller. `verify_jwt` only proves the caller
holds *a* valid key, and the anon key ships in the app, so any user could invoke
them. `auto-assign` was worst: it accepts `{"force": true}` to skip its schedule
and run the weekly draft for every collective immediately.

Fixed by `supabase/functions/_shared/cron-auth.ts`, required by all four.

**Deployment:** the scheduler must now send
`Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. If it currently uses the
anon key these return 401 and the weekly loop stops. See
`supabase/functions/README.md`.

---

## 3. FIXED — Age gate accepted impossible dates

`new Date(2000, 1, 31)` rolls over to 2 March rather than returning `NaN`, so
`isNaN` alone accepted `31-02-2000`. Now the parsed parts are compared back to
what was typed.

Note the rollover always moved the date *later*, i.e. made the user look
*younger*, so it could not be used to slip past the 16+ check.

---

## Related, not a vulnerability

**The date of birth is discarded.** `sign-up.tsx` validates it and then calls
`signUp(email, password, username)` — the DOB is never passed on, and no
`date_of_birth` column exists in any migration. So nothing records that the
check happened. `CLAUDE.md` calls the age gate mandatory; if this ever goes
commercial you would have no evidence of compliance. Storing a full DOB is
extra PII, so an `age_verified_at timestamptz` on `profiles` may be the better
trade — worth a deliberate decision either way.

**`credits_transaction` is correctly locked down** (`revoke execute ... from
anon, authenticated`). That is right, and it is why the client-side award in
`useTaskStore` always fails — see the credits note in
`supabase/functions/README.md`.
