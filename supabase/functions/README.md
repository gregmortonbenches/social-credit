# Edge Functions

Six Deno functions. Three are scheduled (cron), three are request-driven.

| Function | Trigger | Caller auth |
|---|---|---|
| `auto-assign` | Cron — Sunday, `AUTO_ASSIGN_HOUR` in each collective's timezone | Service role |
| `weekly-reset` | Cron — Monday 00:00 in each collective's timezone | Service role |
| `denounce-timeout` | Cron — frequent | Service role |
| `send-notification` | Called by the other functions | Service role |
| `delete-account` | Called by the app | User JWT |
| `award-task-credits` | Called by the app on task completion | User JWT |

## Caller authentication (required)

The three cron functions run with the service role and act on **every collective
in the database**, so they must never be reachable by app users.

Supabase's default `verify_jwt` is not enough on its own: it proves the caller
presented *a* valid key, and the anon key is embedded in the shipped mobile app.
Any user could extract it and invoke these endpoints directly.

All three therefore call `rejectNonCronCaller()` from `_shared/cron-auth.ts`,
which requires the service role key explicitly — the same guard
`send-notification` already used.

**Because of this, the scheduler must send the service role key:**

```
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
```

If your cron currently invokes these with the anon key, it will start returning
`401 Unauthorized` after this change and the weekly game loop will stop
running. Update the schedule's header before or alongside deploying.

There is no `pg_cron` setup in `supabase/migrations/`, so the schedule is
configured outside this repo (Supabase dashboard, or an external scheduler).
Check there.

## Deploying

```bash
supabase functions deploy auto-assign
supabase functions deploy weekly-reset
supabase functions deploy denounce-timeout
supabase functions deploy send-notification
supabase functions deploy delete-account
supabase functions deploy award-task-credits
```

## Duplicated gameplay constants

`CLAUDE.md` requires all tunable gameplay values to live in
`constants/config.ts`. The Edge Functions run in Deno and cannot reliably import
from the app's source tree, so several values are currently duplicated as local
`const`s:

| Function | Duplicated |
|---|---|
| `auto-assign` | `AUTO_ASSIGN_HOUR`, `WEEKLY_CREDIT_POOL`, `DEFAULT_TASK_DUE_HOUR`, `DEFAULT_TASK_DUE_MINUTE`, `STAGGER_TASK_DUE_DATES` |
| `denounce-timeout` | `RESPONSE_WINDOW_HOURS`, `DENOUNCE_ACCUSER_REWARD` |

All of these currently match `constants/config.ts` — but nothing enforces that.
If you change a value in `config.ts`, change it here too.

`reschedule_assignment` in `014_assignment_write_hardening.sql` repeats the
23:59 end-of-day for the same reason — SQL cannot import from the app either.

## Credits on task completion

`credits_transaction` is revoked from `anon` and `authenticated`
(`001_initial_schema.sql`), so the client cannot settle credits itself. It calls
`award-task-credits` instead, which authenticates the user, re-reads the
assignment to confirm they own it and that it is actually complete, takes the
amount from `credits_value` on the row rather than from the request, and then
calls the RPC with the service role.

The function is idempotent — it checks `credit_ledger` for an existing
`task_complete` row against the same `reference_id` before paying out, the same
check `weekly-reset` makes. So `weekly-reset` is now a real fallback for a call
that failed (offline, say) rather than the only path.

Do not widen the grant on `credits_transaction` to fix a similar problem
elsewhere; give the operation its own function with its own ownership check.
