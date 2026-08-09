# Edge Functions

Six Deno functions. Four are scheduled (cron), two are request-driven.

| Function | Trigger | Caller auth |
|---|---|---|
| `auto-assign` | Cron — Sunday, `AUTO_ASSIGN_HOUR` in each collective's timezone | Service role |
| `weekly-reset` | Cron — Monday 00:00 in each collective's timezone | Service role |
| `draft-timeout` | Cron — frequent | Service role |
| `denounce-timeout` | Cron — frequent | Service role |
| `send-notification` | Called by the other functions | Service role |
| `delete-account` | Called by the app | User JWT |

## Caller authentication (required)

The four cron functions run with the service role and act on **every collective
in the database**, so they must never be reachable by app users.

Supabase's default `verify_jwt` is not enough on its own: it proves the caller
presented *a* valid key, and the anon key is embedded in the shipped mobile app.
Any user could extract it and invoke these endpoints directly.

All four therefore call `rejectNonCronCaller()` from `_shared/cron-auth.ts`,
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
supabase functions deploy draft-timeout
supabase functions deploy denounce-timeout
supabase functions deploy send-notification
supabase functions deploy delete-account
```

## Duplicated gameplay constants

`CLAUDE.md` requires all tunable gameplay values to live in
`constants/config.ts`. The Edge Functions run in Deno and cannot reliably import
from the app's source tree, so several values are currently duplicated as local
`const`s:

| Function | Duplicated |
|---|---|
| `auto-assign` | `AUTO_ASSIGN_HOUR`, `WEEKLY_CREDIT_POOL`, `DEFAULT_TASK_DUE_HOUR`, `DEFAULT_TASK_DUE_MINUTE` |
| `draft-timeout` | `DRAFT_TURN_TIMEOUT_MINUTES`, `WEEKLY_CREDIT_POOL` |
| `denounce-timeout` | `RESPONSE_WINDOW_HOURS`, `DENOUNCE_ACCUSER_REWARD` |

All of these currently match `constants/config.ts` — but nothing enforces that.
If you change a value in `config.ts`, change it here too.

`DRAFT_TURN_TIMEOUT_MINUTES` is the exception: it exists **only** here and has no
counterpart in `config.ts`.

## Known issue: credits are not awarded on completion

`store/useTaskStore.ts` tries to award credits the moment a task is completed,
but `credits_transaction` is revoked from `anon` and `authenticated`
(`001_initial_schema.sql`), so that client call always fails. Credits are
settled only by `weekly-reset`, meaning a completed task shows no credit change
until Monday.

Fixing this needs a new authenticated Edge Function that verifies the caller
owns the assignment and then calls the RPC with the service role.
