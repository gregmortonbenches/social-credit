# Where am I up to?

There is no migration tracking table in this project — migrations have been run
by hand in the SQL editor — so nothing in the database records what has been
applied to it.

**Start here:** paste `supabase/CHECK_STATE.sql` into the Supabase SQL editor and
run it. It reads catalog tables only, changes nothing, and prints one row per
migration saying `applied` or `>>> MISSING`.

Then work through whatever it reports missing, in the order below.

---

## 1. Migrations

Run each missing file's contents in the SQL editor, **lowest number first**.
They are not independent — 014 assumes 013, and so on.

| File | Why it matters |
|---|---|
| `009_weekly_assignments_delete.sql` | Almost certainly missing. It used a set-returning function directly in a policy, which Postgres rejects, so it errored every time it was run. Repaired in this branch |
| `013_collective_join_hardening.sql` | **Security.** Any signed-in user could read every collective's join code and insert themselves as an active member of any household |
| `014_assignment_write_hardening.sql` | **Security.** A member could rewrite `credits_value` on their own assignment, or park `due_date` in 2030 to dodge the failure penalty |
| `015_age_verification.sql` | Records that the 16+ check passed |
| `016_denouncement_hardening.sql` | **Security.** The accused could set their own `outcome` and acquit themselves before any vote |
| `017_overdue_reminder.sql` | Adds the guard column for the overdue push |
| `018_function_execute_hardening.sql` | **Critical, do this first if you do nothing else.** `credits_transaction` is callable by any signed-in user, so anyone with the app can mint themselves unlimited credits |

> `001` and `009` were also **repaired in place** in this branch, because neither
> could ever have been applied to a fresh database. That only matters if you are
> setting up a new environment; an existing database that already has 001's
> tables does not need it re-run.

## 2. Edge Functions

```bash
supabase functions deploy auto-assign          # changed: staggered due dates
supabase functions deploy weekly-reset         # changed: promotes pending members
supabase functions deploy denounce-timeout
supabase functions deploy send-notification
supabase functions deploy delete-account
supabase functions deploy award-task-credits   # new
supabase functions deploy notify-collective    # new
supabase functions deploy overdue-reminder     # new
```

`draft-timeout` was **deleted** — it queried columns migration 003 had already
dropped, so every run was erroring. Remove it from your project and from the
schedule.

## 3. Cron schedules

`overdue-reminder` is new and needs scheduling **hourly**.

Every cron function now requires the service role key as a bearer token — if
your schedules currently send the anon key they will return 401 and the weekly
loop will stop:

```
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
```

Applies to: `auto-assign`, `weekly-reset`, `denounce-timeout`, `overdue-reminder`.

## 4. Secrets

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do not set them.

## 5. Auth (only when you want Google/Apple sign-in)

See `docs/AUTH_SETUP.md`. In Supabase specifically: add
`socialcredit://auth-callback` under Authentication → URL Configuration →
Redirect URLs, and enable the providers.

## 6. Still outside Supabase

- `google-services.json` is absent from the repo, so **Android push cannot
  deliver anything** regardless of what the functions send.
- `docs/PRIVACY.md` and `docs/TERMS.md` are unreviewed drafts with unfilled
  placeholders, and nothing is hosting them yet.

---

## Checking it worked

Re-run `CHECK_STATE.sql` — every row should say `applied`.

For the behaviour rather than the presence of the objects, `npm run test:db`
applies the whole chain to a throwaway database and asserts 18 policy
behaviours. It needs a local Postgres, not your live project.
