# Test household

Scripts for trying the app with more than one person. They add three comrades
(Boris, Natasha, Mao-Mao) to **your real collective**, give them tasks and
denouncement cases, and remove them again afterwards. Nothing here ships in the
app; it is plain SQL for the Supabase dashboard.

**Where to run them:** Supabase dashboard → project `mtoypwkkabwwrxtiybnp` →
SQL Editor → New query → paste → Run. Claude cannot run them for you (writes to
the live database are blocked), but can put each file on your clipboard.

## Order

| # | File | What it does |
|---|---|---|
| 1 | `01_add_test_comrades.sql` | Adds the three comrades as active members |
| – | **Settings → DEV → Force Assign Tasks** | In the app. Hands this week's tasks to all four of you |
| 2 | `02_mixed_week.sql` | Boris finishes a task (and is paid); Natasha's first task goes overdue |
| 3 | `03_cases.sql` | Three denouncements: you v Natasha (25h old), Natasha v you (fresh), Boris v Mao-Mao (answered, awaiting your vote) |
| – | In the app | Respond to Natasha's case against you; vote on Boris v Mao-Mao |
| 4 | `04_fake_votes.sql` | Natasha votes, so the vote case has all its jurors |
| 5 | `05_settle_now.sql` | Runs the real settlement now instead of waiting for the hourly cron |
| 99 | `99_remove_test_comrades.sql` | Removes everything and restores your credits |

Re-running a script is safe. Force Assign again afterwards to redistribute the
tasks the comrades held.

## Things to know

- **Natasha v you has a 24-hour clock.** Leave it unanswered and the hourly cron
  settles it as auto-guilty and you lose that task's credits. Respond in the app
  (or run `99_remove_test_comrades.sql`, which reverses it).
- **Case 1 settles itself** within the hour even if you never run script 5.
- **Remove the test comrades before Monday 00:00** (the collective's time). The
  weekly reset counts their tasks, and a week with a failed task resets your
  prosperity streak.
- The comrades cannot sign in, so they cannot respond or vote on their own. For
  the voting screen as a second person you need a second real account.
- Test comrades are recognisable by email (`seed-*@seed.invalid`) and fixed ids
  starting `feed0000-`.
- The scripts use `gregmorton03@gmail.com` to find your collective; change it at
  the top of scripts 01, 03 and 05 and at the bottom of 99 if that is wrong.
