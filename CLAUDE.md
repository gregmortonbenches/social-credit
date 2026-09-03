# CLAUDE.md — Social Credit App

This file is the canonical reference for Claude Code working on the Social Credit project. Read this entire file before making any changes to the codebase.

---

## What This App Is

Social Credit is a mobile app (iOS + Android) for households ("Collectives") to manage domestic tasks through a playful gamified credit system inspired by Chinese Communist propaganda aesthetics. Users earn and lose credits for completing or failing tasks, can "Denounce!" each other for shirking duties, and compete on weekly scoreboards.

This is currently a private project for personal use. It is not a commercial product. Legal/compliance requirements (ICO registration, full privacy notice) are deferred until a future commercial launch.

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Expo SDK (latest) + TypeScript | React Native, file-based routing |
| Routing | Expo Router | |
| Database | Supabase (Postgres) | Free tier |
| Auth | Supabase Auth | Email/password + Google + Apple Sign-In |
| Realtime | Supabase Realtime | Live scoreboards, draft state |
| Scheduled Jobs | Supabase Edge Functions (cron) | Weekly reset, draft timeout, denounce timeout |
| Push Notifications | FCM (Firebase Cloud Messaging) | Free, unlimited — delivery only, NOT Firebase backend |
| Push Token Mgmt | Expo Notifications | Device-side token handling |
| State | Zustand + AsyncStorage | Persisted session |
| Styling | NativeWind (Tailwind for RN) | |
| Deep Links | Expo Linking | Collective invite links |

### Why This Stack at $0
- Supabase free tier covers: Postgres DB, realtime subscriptions, Edge Function cron jobs
- FCM is used purely as a push delivery transport — completely free, no limits
- We do NOT use Firebase as a backend. Firebase free tier (Spark) blocks scheduled Cloud Functions entirely, making it unusable for our weekly reset mechanic
- Supabase free projects pause after 1 week of inactivity — ping it or use a keep-alive cron during development

---

## Absolute Rules

**Never hardcode gameplay values.** All tunable numbers live in `/constants/config.ts`. Import `CONFIG` everywhere. Never write a raw credit amount, timeout, or penalty value directly in component or function code.

**All credit changes must be written to `credit_ledger`.** Never update `profiles.total_credits` directly. Always append a ledger row with `reason` and `reference_id` in the same database transaction.

**Collective timezone is the source of truth for all scheduling.** Draft windows, weekly resets, and task due dates all run on the collective's configured IANA timezone (set at creation from the creator's device). Device timezone is only used for notification quiet hours. This applies to the client too, not just the Edge Functions: use the helpers in `lib/draft.ts` (decision 37) for any day- or week-boundary question.

**Always prefix usernames with "Comrade"** in all UI copy. Never display a raw username.

**Achievements must not be previewed before unlock.** Locked achievements show as silhouette/empty stamps only — no title, no description.

**RLS must be enforced.** Users may only read/write rows where `collective_id` matches a collective they are an active member of. Never bypass Row Level Security from client code.

**Never write `collective_members` from the client.** The table has no INSERT or UPDATE policy for `authenticated` (migration 013). Joining, creating, pausing, resuming and leaving all go through the SECURITY DEFINER RPCs, which check the *current* status before writing — something a `WITH CHECK` clause cannot do. Do not add a policy to "fix" a permission error here; add or extend an RPC.

**Age gate is mandatory.** Sign-up must block users under 16 via a date-of-birth field check, and record that it passed in `profiles.age_verified_at`. The date of birth itself is deliberately not stored — the timestamp answers the compliance question without retaining the extra personal data.

**FCM is for delivery only.** Never use Firestore, Firebase Auth, or Firebase Cloud Functions. Use only the `firebase-admin` SDK within Supabase Edge Functions to send FCM messages.

---

## Project Structure

```
/app                          Expo Router screens
  /(auth)
    sign-in.tsx
    sign-up.tsx
  /(onboarding)
    slide-1.tsx
    slide-2.tsx
    slide-3.tsx
  /(app)
    _layout.tsx
    index.tsx                 3-panel swipeable home (Tasks | Collective | Scoreboard)
    collective/
      create.tsx
      join.tsx
      preferences.tsx
    achievements.tsx
    settings.tsx

/components
  tasks/                      Task cards, completion button, overdue indicators
  collective/                 Scoreboard, wheat field, draft UI
  denouncements/              Wall poster cards, voting UI, response text input
  achievements/               Badge grid, unlock animation/overlay
  ui/                         Shared primitives — Button, Card, Badge, Modal, Toast

/lib
  supabase.ts                 Supabase client initialisation
  notifications.ts            FCM push helpers (called from Edge Functions)
  credits.ts                  All credit award/deduction logic — always use this, never ad-hoc
  achievements.ts             Achievement checker + payload builders for all event types
  draft.ts                    isAssignmentTime() / getNextAssignmentMs() helpers

/store
  useAuthStore.ts
  useCollectiveStore.ts
  useTaskStore.ts
  useDenouncementStore.ts
  useAchievementStore.ts      Shared unlock queue — all stores push here, overlay reads from here

/constants
  config.ts                   ALL tunable gameplay variables
  achievements.ts             All 40 achievement definitions
  tasks.ts                    Default task library
  theme.ts                    Design tokens

/supabase
  migrations/
    001_initial_schema.sql
  functions/
    weekly-reset/index.ts
    auto-assign/index.ts
    denounce-timeout/index.ts
    send-notification/index.ts
    delete-account/index.ts
```

---

## Gameplay Variables (`/constants/config.ts`)

```typescript
export const CONFIG = {
  // Credits
  STARTING_CREDITS: 500,
  WEEKLY_CREDIT_POOL: 1000,
  // Credit value per task = WEEKLY_CREDIT_POOL / total_tasks_this_week
  // Calculated at draft close, stored in weekly_assignments.credits_value
  // Loss for failing a task is symmetrical to earn value

  // Denouncements
  DENOUNCE_ACCUSER_REWARD: 100,
  DENOUNCE_ACCUSER_PENALTY: 50,
  DENOUNCE_TWO_PERSON_ABUSE_THRESHOLD: 3,
  DENOUNCE_TWO_PERSON_ABUSE_PENALTY: 150,
  DENOUNCE_TWO_PERSON_WINDOW_DAYS: 60,
  DENOUNCE_RESPONSE_WINDOW_HOURS: 24,
  DENOUNCE_EXPLANATION_MAX_WORDS: 300,

  // Auto-assignment (Sunday, collective timezone) — see Decision 19
  AUTO_ASSIGN_HOUR: 14,

  // Collective
  COLLECTIVE_CODE_LENGTH: 5,
  COLLECTIVE_NAME_MAX_CHARS: 30,

  // Task due dates (collective timezone)
  DEFAULT_TASK_DUE_DAY: 0,        // 0 = Sunday
  DEFAULT_TASK_DUE_HOUR: 23,
  DEFAULT_TASK_DUE_MINUTE: 59,
  // Individual task deadlines can be overridden via weekly_assignments.due_date in the DB
};
```

Admins can override any value at runtime via the `app_config` Supabase table without redeploying.

---

## Database Schema (Supabase Postgres)

**`profiles`** — extends `auth.users`
`id` · `username` · `email` · `total_credits` (int, default 500) · `device_push_token` · `anonymous_token` (set on deletion) · `age_verified_at` (16+ check passed; the DOB itself is not stored) · `deleted_at` (30-day grace period) · `created_at`

**`collectives`**
`id` · `name` · `display_name` (name + " Collective") · `code` (char 5, unique) · `timezone` (IANA string) · `created_by` · `rooms` (jsonb) · `created_at`

**`collective_members`**
`id` · `collective_id` · `user_id` · `status` (active | paused | pending | left) · `joined_at` · `pause_started_at` · `pause_ended_at`

**`task_library`**
`id` · `name` · `room_type` · `description` · `is_custom` (bool) · `created_by_collective_id`

**`weekly_assignments`**
`id` · `collective_id` · `user_id` · `task_id` · `week_start` (date, Monday) · `due_date` (timestamptz, default Sunday 23:59 collective TZ) · `completed_at` · `credits_value` (int, set at draft close) · `status` (pending | complete | failed | reassigned)

**`denouncements`**
`id` · `collective_id` · `accuser_id` · `accused_id` · `assignment_id` · `status` (open | responded | auto_guilty | voted | resolved) · `explanation` (text, max 300 words) · `outcome` (upheld | dismissed) · `created_at` · `responded_at` · `resolved_at`

**`denouncement_votes`**
`id` · `denouncement_id` · `voter_id` · `vote` (uphold | dismiss) · `created_at`

**`draft_state`**
`id` · `collective_id` · `week_start` · `draft_order` (jsonb — ordered user_id array) · `current_turn_index` (int) · `turn_deadline` (timestamptz) · `status` (pending | complete)

**`task_preferences`**
`id` · `user_id` · `collective_id` · `task_id` · `rank` (int — lower = higher preference) · `updated_at`
Unique constraint on `(user_id, collective_id, task_id)`. Used by `auto-assign` to determine pick order. No preferences = eligible for any task in round-robin fallback.

**`achievements`**
`id` · `user_id` · `achievement_key` · `collective_id` · `unlocked_at`

**`credit_ledger`** — immutable, append-only
`id` · `user_id` · `collective_id` · `delta` (int) · `reason` (text) · `reference_id` (uuid) · `created_at`

**`app_config`**
`key` (PK) · `value` (jsonb) · `updated_at` · `updated_by`

Realtime enabled on: `weekly_assignments`, `denouncements`, `collective_members`, `credit_ledger`, `draft_state`

RLS: users read/write only rows belonging to their collective. `credit_ledger` inserts via service role only. `app_config` updates via admin flag only.

---

## Key Business Logic

### Credit Economy
- Credit value per task = `WEEKLY_CREDIT_POOL / total_tasks_this_week` — calculated at draft close, stored per assignment
- Task complete: `+credits_value` — awarded immediately on completion via `awardTaskCredits()` in `useTaskStore.completeTask`, which calls the `award-task-credits` Edge Function (the client cannot call `credits_transaction` directly — it is revoked from `authenticated`). `weekly-reset` runs the same dedup check and is a genuine fallback if that call fails
- Task failed: `-credits_value` (symmetrical) — deducted by `weekly-reset` when assignment is marked failed at Monday 00:00
- Denouncement upheld: accused `-credits_value`, accuser `+DENOUNCE_ACCUSER_REWARD`
- Denouncement dismissed: accuser `-DENOUNCE_ACCUSER_PENALTY`
- 2-person abuse (≥3 denouncements in 60 days): both `-DENOUNCE_TWO_PERSON_ABUSE_PENALTY`, counter resets
- Credits cumulative all-time
- Denouncement credits excluded from collective prosperity quota

### Collective Prosperity Quota
- Sum of task completion credits earned this week ÷ `WEEKLY_CREDIT_POOL`
- Display only — not stored separately
- Visualised as growing/declining wheat field on the Right Panel

### Task Due Dates
- `auto-assign` **staggers** each member's tasks across their week
  (`CONFIG.STAGGER_TASK_DUE_DATES`), with the last always landing on the backstop
  day — Sunday 23:59 collective timezone (`CONFIG.DEFAULT_TASK_DUE_*`). The
  spread is even across Mon–Sun inclusive: one task means Sunday, two Mon/Sun,
  three Mon/Thu/Sun, seven one per day. Tasks are handed out in preference order,
  so a member's top pick is due first.
- Members **reschedule** any outstanding task of their own to another day of the
  same week via the `reschedule_assignment` RPC (day picker on the task card).
  Several tasks on one day is allowed and expected.
- `due_date` is **not client-writable** — see decision 38.

### Auto-Assignment (Sunday 14:00+, collective timezone)
- Runs automatically — no interactive turns
- Order: previous week's task-completion credits, highest earner picks first
- Algorithm: round-robin in ranked order; each user gets their highest-ranked available task, repeat until all tasks assigned
- Unranked tasks fall to round-robin in same performance order
- Constraint: every active member gets ≥1 task (handled naturally by round-robin when tasks ≥ members)
- credits_value = WEEKLY_CREDIT_POOL / total_tasks_assigned — set at assignment time
- Members set preferences via "MY TASK PREFERENCES" in CollectivePanel → stored in task_preferences table
- First time a user joins a collective with no preferences, a modal prompts them to set preferences

### Denounce! State Machine
```
open → responded  (explanation submitted within 24h)
          └→ resolved  (majority vote; tie = dismissed)
     → auto_guilty  (no response in 24h)
```
2-person collective: auto-upheld, no vote. Abuse tracking applies.

The "DENOUNCE A COMRADE!" button is disabled when there is nobody to denounce
(no other active members) or nothing to denounce them for (no overdue tasks),
with a line saying which — opening the modal in that state was a dead end.

### Holiday Pause
- Freeze credits, redistribute tasks (lowest-task member first), re-enter draft next Sunday

### Mid-Week Join
- Status: `pending` until Monday 00:00. Starting credits: 500. No tasks until first full week.
- Set by `join_collective_by_code()`, which decides active vs pending from the **collective's** timezone, and cleared by `weekly-reset`, which promotes every `pending` member to `active` at the Monday reset.

### Account Deletion
1. Hard delete: auth record, email, push token, achievements, profile (immediate — no grace period yet)
2. Anonymise: set `user_id` to `NULL` in `weekly_assignments` and `credit_ledger` → display "Former Comrade"
3. Redact: denouncement explanations → `[content removed]` for any denouncement where user was accuser or accused
4. `task_preferences` rows are not yet cleaned up on deletion (see Not Built Yet)

---

## Edge Functions

| Function | Schedule | Status | Purpose |
|---|---|---|---|
| `weekly-reset` | Cron hourly | Deployed | Checks each collective's Monday 00:00 local time — settle credits, snapshot week, create pending draft_state row |
| `auto-assign` | Cron every 5 min | Deployed | Preference-based auto-assignment on Sunday ≥14:00 collective timezone |
| `denounce-timeout` | Cron hourly | Deployed | Apply auto-guilt to unanswered denouncements |
| `send-notification` | HTTP (called by other functions) | Deployed | Send FCM push via firebase-admin — requires `Authorization: Bearer <SERVICE_ROLE_KEY>` header |
| `delete-account` | HTTP (called by client) | Deployed | Called by client with user JWT; uses service role internally |
| `award-task-credits` | HTTP (called by client) | Deployed | Settles completion credits immediately. User JWT; verifies caller owns the assignment, reads the amount from the row, idempotent against `credit_ledger` |

Timezone note: crons run UTC. Each function computes the collective's local time using its IANA timezone string and `date-fns-tz`. Never hardcode UTC offsets.

---

## Push Notification Copy (exact — do not change wording)

- `"You have been Denounced!!"`
- `"[Comrade Name] resists the denunciation!"`
- `"It's your turn in the Weekly Draft, Comrade! You have 1 hour."`
- `"The Weekly Draft is open! Gather your comrades."`
- `"The Draft closes in 1 hour, Comrade!"`
- `"A task is overdue, Comrade. Do not fail the Collective."`
- `"Your draft turn passed — a task has been assigned for you."`
- `"[Comrade Name] has joined the Collective!"`
- `"Achievement unlocked: [Achievement Title]!"`

---

## Design System

**Palette**
```
Primary:     #C20000   revolutionary red
Accent:      #000000   black
Background:  #F0EAD6   cream
Surface:     #E8DECA   slightly darker cream (cards, inputs, tabs)
Text:        #000000   body text (on background/surface)
Muted:       #7A6A5A   warm grey-brown (secondary text, placeholders)
Success:     #27AE60
Danger:      #E74C3C
```

**Aesthetic:** Light cream background (#F0EAD6) — propaganda poster / print style, not a dark UI. Headers UPPERCASE, bold, letter-spacing 2px. Cards as official notices/wall posters. Denouncement cards: red border, stamp aesthetic. Achievement badges: seal/stamp, silhouette until unlocked. Loading screen: animated progress bar with "MENTAL LOADing..." label above it (`components/ui/LoadingScreen.tsx`); collectivisation progress bar style. Numbers/credits: monospaced.

**Propaganda poster image:** `assets/images/propaganda-poster.jpg` — displayed at the top of the Tasks and Scoreboard panels (220px tall, `resizeMode="cover"`, edge-to-edge). A `LinearGradient` overlay (`expo-linear-gradient`) fades the bottom 80px from transparent to `COLORS.background`. The panel header text sits below the image.

**Buttons:** Sharp corners throughout (`borderRadius: 0`). No rounded edges on any interactive button.

**Panel headers** (THE COLLECTIVE / TASKS / WEEKLY CREDIT): plain bold red text only — no background bar, no stars, no decorative wrapper `View`.

**Home screen navigation:** Dot indicators at the bottom of the screen only (`app/(app)/index.tsx`). The top tab bar has been removed. Dots are tappable as well as swipeable. Home screen is wrapped in `SafeAreaView edges={['top']}` from `react-native-safe-area-context`.

**Copy:** Always "Comrade [Username]". Always "Collective". The scoreboard panel is titled "WEEKLY CREDIT" (not "Weekly Scoreboard"). Rotate the 7 Chinese housekeeping proverbs as loading/empty state text. Empty states use propaganda-style motivational copy.

### Changing colours

The single source of truth is `constants/theme.ts` — update `COLORS` there first. Most of the codebase consumes `COLORS.*` tokens and will update automatically.

**After editing `theme.ts`, also update these hardcoded values manually:**

| File | What | Why hardcoded |
|---|---|---|
| `app/_layout.tsx` | `contentStyle.backgroundColor` | Stack navigator prop, can't use token |
| `app/(app)/_layout.tsx` | `contentStyle.backgroundColor` | Same |
| `app/(onboarding)/_layout.tsx` | `contentStyle.backgroundColor` | Same |
| `app/(auth)/_layout.tsx` | `contentStyle.backgroundColor` | Same |
| `app.json` | `splash.backgroundColor`, `android.adaptiveIcon.backgroundColor`, `primaryColor`, the `expo-notifications` plugin `color` | Static config file |

**Button text is always `'#FFFFFF'`, never `COLORS.text`** — `text` is body colour (dark on cream); buttons are red or black so need white text. These files hardcode white for button labels:
- `components/ui/PropagandaButton.tsx` — central button component (`fg` variable)
- `components/tasks/TaskCard.tsx` — tick button (`tickText`)
- `app/(app)/index.tsx` — landing CTAs (`landingBtnText`)
- `app/(onboarding)/slide-1.tsx` — next button (`nextText`)
- `app/+not-found.tsx` — return button (`btnText`)
- `components/collective/CollectivePanel.tsx` — denounce/action buttons (`actionBtnText`, `denounceBtnText`)
- `components/denouncements/DenounceCard.tsx` — resist/uphold buttons (`resistBtnText`, `upholdText`)

**Ghost button** (`PropagandaButton` `variant="ghost"`) uses `COLORS.primary` as text colour (red text on transparent background) — update `fg` logic in `PropagandaButton.tsx` if primary changes.

**Other hardcoded colours in `DenounceCard.tsx`** are intentional propaganda-poster styling (aged paper tones) and are independent of the main palette — only change them if the card aesthetic changes.

---

## Achievements (`/constants/achievements.ts`)

Hidden until unlocked. Show silhouette only for locked.

**Cleaning (1–10):** Class Struggle · The Westward Expansion · The Eastward Expansion · Struggle Sessions · Hero of the People · Backyard Furnace · The Iron Rice Bowl · Re-education through Labour · The Hundred Flowers Campaign · The Ten Great Constructions

**Longevity (11–20):** The Long March · People's Communes · Production Team · The Three-Anti Campaign · The Gang of Four · Five-year Plan · Production Brigade · Land Reform · Continuous Revolution · The Sino-Soviet Split

**Interaction (21–30):** Know the Enemy · Purge the Bourgeoisie · Planned Economy · Cultural Revolution · Party Leadership · Worker's Faculties · United Front · Self-reliance · Patriotic War · Double Agents

**Collective (31–40):** Rally the Peasants · Collectivisation · Mass Line · Household Responsibility System · Socialist Realism (placeholder) · Young Pioneers · Propaganda · Special Economic Zones · Reform and Opening Up · Four Modernisations

Run achievement checks after: task completion, denouncement resolution, vote cast, draft completion, member join/leave, holiday return.

---

## Default Task Library (`/constants/tasks.ts`)

Take out the bins · Clean the bathroom · Washing up · Hoover and mop · General clean · Clean the kitchen · Clean the bedroom · Clean living room · Clean the hallway · Clean dining room

Custom tasks proposed via in-app vote, stored in `task_library` with `is_custom: true`.

---

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL           Supabase project URL (safe for client)
EXPO_PUBLIC_SUPABASE_ANON_KEY      Supabase anon key (safe for client)
```

Those two are the **only** values that go in `.env.local`. Anything prefixed
`EXPO_PUBLIC_` is compiled into the shipped bundle, so a secret placed there is
public.

Edge Function secrets are set with `supabase secrets set` and never appear in
any `.env` file:

```
FIREBASE_SERVICE_ACCOUNT_JSON      Full Firebase service account JSON, single-line
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into Edge Functions by Supabase automatically — do not set them yourself.

There is no `FCM_SERVER_KEY`. Google shut the legacy server-key API down in 2024;
`send-notification` uses `firebase-admin`, which requires a service account.

`.env` is gitignored. Keep `.env.example` up to date with all keys listed but empty.

---

## Decisions Log

| # | Decision | Choice |
|---|---|---|
| 1 | Task due dates | Staggered across the week per member by `auto-assign`, backstop Sunday 23:59; members reschedule within their week via `reschedule_assignment`. Superseded the single shared Sunday deadline, which left "TODAY'S DUTIES" empty six days in seven and made a task `overdue` only in the sliver between Sunday 23:59 and the Monday reset — the window denouncing depends on. |
| 2 | Credit maths | `WEEKLY_CREDIT_POOL / task_count`, symmetrical loss, all in config |
| 3 | Multi-collective | Future feature only — no core architecture impact |
| 4 | Socialist Realism | Placeholder badge, no trigger yet |
| 5 | Content moderation | Deferred — private personal project |
| 6 | ICO / legal | Deferred — not commercial yet |
| 7 | Sign-in | Email/password + Google + Apple (Apple required if Google offered) |
| 8 | Backend | Supabase + FCM only. No Firebase backend. |
| 9 | Account deletion | Handled by `delete-account` Edge Function (service role). Client calls `supabase.functions.invoke('delete-account')`. Weekly assignments and credit ledger user_id set to NULL (anonymised as "Former Comrade") — requires nullable FKs from migration 002. |
| 10 | Push tokens | Use `getDevicePushTokenAsync()` (native FCM/APNs token), NOT `getExpoPushTokenAsync()` — Firebase Admin requires native tokens |
| 11 | AsyncStorage version | Pin to `^2.1.0`. Version 3.x breaks Expo Go (native module null error). |
| 12 | Auth listener | `onAuthStateChange` registered once via module-level `authListenerRegistered` flag. Do not call it inside `loadSession()` or any function called more than once. |
| 13 | Collective join flow | `lookupCollective(code)` is read-only (no insert). `joinCollective(collectiveId, userId)` does the insert. Always call lookup first, join only on explicit user confirmation. |
| 14 | Assignment time check | Always use `isAssignmentTime(collective.timezone)` from `lib/draft.ts`. Never re-implement using device local time. |
| 15 | Colour theme | Light cream (#F0EAD6) background, red (#C20000) primary, black (#000000) accent. Dark theme abandoned. The red was #CC0000 until the accessibility pass: it missed WCAG AA on `surface` (4.41), which affects red-on-surface headers. #C20000 is 5% darker, visually indistinguishable, and clears AA on both grounds — every palette pair now passes. See "Changing colours" guide in Design System section. |
| 16 | Button style | `borderRadius: 0` on all buttons throughout the app — sharp corners only. |
| 17 | Home navigation | Top tab bar removed. Dot indicators at bottom are the sole panel navigation. |
| 18 | Prosperity visualiser | `WheatField.tsx` renders three tiled copies of a Noun Project crop SVG (noun-crops-7578613) side by side using `SvgXml` from `react-native-svg`. Opacity scales from 0.55 (0%) to 1.0 (100%) based on `quotaPercent`. Height 180px. Gold colour `#C89600`. Ground lines intentionally overlap between copies. Attribution text excluded from rendered XML. |
| 19 | Task assignment | Interactive snake draft replaced by preference-based auto-assignment. Users rank tasks via `app/(app)/collective/preferences.tsx`. Runs Sunday 14:00 collective timezone via `auto-assign` Edge Function. Performance-ordered (highest credits last week picks first); ties broken by random shuffle before sort. `draft-timeout` Edge Function deleted; `draft_state` simplified to pending/complete only. |
| 20 | Preference prompt | First-visit modal shown on home screen when a user has no preferences saved for their collective. Dismissed state stored in AsyncStorage under key `prefs_prompted_{collectiveId}_{userId}`. |
| 21 | Collective membership lookup | `loadUserCollective` in `app/(app)/index.tsx` uses `.limit(1).order('joined_at', descending)` not `.maybeSingle()` — multiple `collective_members` rows for the same user (created across test sessions) would cause `.maybeSingle()` to return a silent error and never load the collective. |
| 22 | No-collective landing | `NoCollectiveLanding` has a sign-out link so users are never fully stuck if their account state is broken. The "SOCIAL CREDIT" title heading was removed — users already know where they are after onboarding. |
| 23 | Preferences drag UI | Drag rows show a three-bar handle (`pointerEvents="none"` so touches fall through to the PanResponder on the parent View), scale up with shadow on grab, and dim non-dragged rows. Deduplication of `rankedIds` is applied at both initialisation and render time. **Performance:** PanResponders are keyed by `taskId` and only recreate when the task list changes (not on every drag release) — they read current order from `rankedRef` at grant time. `displayedTasks` is memoised with `useMemo`; task lookup uses a `Map` for O(1) access. `RankedRow` and `UnrankedRow` are wrapped in `React.memo`. Subtitle copy: "Use people according to their abilities." |
| 24 | Panel title rule | All three home panels (Tasks, Collective, Weekly Quota) render a 3px solid red (`COLORS.primary`) horizontal rule immediately below the page title. Defined as `titleRule` style in each panel. |
| 25 | Weekly Quota panel | Formerly "Weekly Credit". Scoreboard panel renamed throughout. Quota card: red 4px top border, big percentage hero number (56px, right-aligned), credit count left-aligned. Progress bar 16px tall, filled red, unfilled area has diagonal SVG hatch (`#5A2020` on `#3D1515`, 8px repeat). "COMRADE STANDINGS" section header: `COLORS.surface` background, red text, thin red top/bottom borders — not a solid red block. Members sorted by weekly delta descending; rank numbers shown (01, 02…); top scorer shows "CHAIRPERSON" sub-label. Circular avatars reused from TaskCard. |
| 26 | Loading screen | Star (★) removed from `LoadingScreen.tsx`. |
| 28 | Avatar colours | `AVATAR_COLORS` and `avatarColor()` are defined once in `constants/theme.ts` and imported by `TaskCard.tsx` and `ScoreboardPanel.tsx`. Palette is drawn from 1950s Chinese propaganda poster aesthetics: propaganda blue `#1B4F8C`, harvest gold `#C87F00`, peasant green `#2B7A2B`, vermillion `#C14A14`, teal `#006B72`, mauve `#7A3070`. |
| 29 | Date of birth input | Sign-up DOB field uses `DD-MM-YYYY` format with a numeric keyboard. Dashes are auto-inserted after the day and month digits via `formatDob()` — users type digits only. Validation parses the three parts and checks age ≥ 16. |
| 30 | Room defaults | Create collective room stepper defaults all room types to 1 (not 0) — users are likely to have at least one of each. They can reduce to 0 or increase via the ±  stepper. |
| 31 | Collective membership writes | `collective_members` has no client INSERT/UPDATE policy. `create_collective`, `join_collective_by_code`, `pause_membership`, `resume_membership` and `leave_collective` are SECURITY DEFINER RPCs (migration 013). Joining takes the **code**, not a collective id — possession of the code is the capability, checked in the DB. Active-vs-pending is decided from the collective's timezone, server-side. |
| 32 | Immediate task credits | `credits_transaction` stays revoked from `authenticated`. `award-task-credits` Edge Function settles completion credits with a user JWT: verifies ownership, reads the amount from the row, idempotent against `credit_ledger`. `weekly-reset` remains the fallback. |
| 33 | Sign-up email confirmation | `signUp()` returns whether a session was established. When Supabase requires email confirmation it returns none, so `sign-up.tsx` shows a "check your email" state instead of routing into onboarding — which previously ended with the root layout bouncing the user back to sign-in with no explanation. |
| 34 | Join code visibility | The code is the only way into a Collective. `create.tsx` has a third step revealing it with copy/share before entering the app, and `CollectivePanel` has an "INVITE COMRADES" button. It remains in Collective Settings as well. |
| 35 | Empty Tasks panel | When a user has no assignments, `TasksPanel` renders `NoAssignmentsNotice` rather than a bare "No tasks due today" line: it distinguishes a `pending` member (awaiting Monday induction) from an active one (next assignment countdown via `formatNextAssignment`), and links to preferences. Gated on `useTaskStore.isLoading` so it does not flash during the first fetch. |
| 36 | Pull-to-refresh | `TasksPanel` has a `RefreshControl` that re-fetches assignments, collective/members and the task library. Realtime subscriptions can drop while backgrounded and there was previously no recovery short of restarting the app. |
| 37 | Collective-timezone calendar helpers | `collectiveDayKey`, `isSameCollectiveDay`, `collectiveWeekStart` and `collectiveWeekStartInstant` in `lib/draft.ts` answer every "what day / what week is it" question in the collective's timezone — including the streak and top-scorer week bucketing in `lib/achievements.ts`, whose keys are compared against `weekly_assignments.week_start` and so must be built in the same timezone the Edge Functions wrote it in. Never use `toDateString()`, `getDay()` or `toISOString().split('T')[0]` on a device-local `Date` for this — the latter re-converts to UTC, so any device behind UTC produces tomorrow's date in the evening. `useTaskStore.fetchAssignments` takes the timezone as a required third argument rather than defaulting, so a missing one is a type error rather than a silent fallback to device time. |
| 38 | Assignment writes | `weekly_assignments` is not wholly client-writable. Migration 014 revokes blanket UPDATE and grants only `(status, completed_at)` to `authenticated`, because the pre-existing UPDATE policy had a `USING` clause and no `WITH CHECK`: a member could rewrite `credits_value` on their own row and then have `award-task-credits` pay it out, or park `due_date` past the weekly reset to escape the failure penalty. Both verified against a local Postgres. Column privileges are checked before any policy, so this cannot be reasoned around. Rescheduling therefore goes through `reschedule_assignment`. |
| 39 | Age gate record | The DOB was validated then discarded, so nothing showed the check had run. `profiles.age_verified_at` records when it passed; the date of birth is still not stored. The timestamp travels in sign-up metadata and `handle_new_user()` copies it into the profile, so it survives the email-confirmation round-trip where there is no client session to write with. Accounts predating this stay null. |
| 27 | Onboarding flow | `app/(onboarding)/slide-1.tsx` contains all 3 slides as a FlatList. Navigation to the app is triggered by swiping past the last slide — a 4th invisible "ghost" slide (`ghost: true`) is appended to `SLIDES`; `onViewableItemsChanged` calls `markOnboarded()` when the ghost slide becomes visible. Dots only show for non-ghost slides (`VISIBLE_SLIDES`). No auto-advance, no button. |

---

## Migrations Applied

| File | Description |
|---|---|
| `001_initial_schema.sql` | Full initial schema, RLS, seed tasks, credits_transaction RPC |
| `002_security_fixes.sql` | FK constraints for anonymisation, RLS fixes (collectives/draft_state/denouncements), profile auto-creation trigger, collective member profile read policy |
| `003_profile_insert_policy.sql` | INSERT policy on profiles so authenticated users can create their own row (fallback for accounts predating the trigger) |
| `003_task_preferences.sql` | `task_preferences` table + RLS; drops interactive draft columns from `draft_state`; simplifies status to pending/complete |
| `004_fix_rls_recursion.sql` | Replaces self-referencing RLS subqueries with a `SECURITY DEFINER` function `get_user_collective_ids()` to break infinite recursion |
| `005_grant_table_privileges.sql` | Grants SELECT/INSERT/UPDATE on all tables to `authenticated` role — required for RLS to be evaluated at all |
| `006_draft_state_insert.sql` | Grants INSERT on `draft_state` to `authenticated`; adds member INSERT policy (needed for dev force-assign button) |
| `007_task_preferences_grant.sql` | Grants SELECT/INSERT/UPDATE/DELETE on `task_preferences` to `authenticated` (missing from 005) |
| `008_own_membership_read_policy.sql` | Adds `user_id = auth.uid()` SELECT policy on `collective_members` so users can always read their own membership row — fixes bootstrap lookup for pending members |
| `009_weekly_assignments_delete.sql` | Grants DELETE on `weekly_assignments` to `authenticated`; adds RLS DELETE policy using `get_user_collective_ids()` — required for dev force-assign button to clear pending assignments |
| `010_collective_public_lookup.sql` | Adds SELECT policy allowing any authenticated user to read from `collectives` — required for non-members to look up a collective by code before joining, and for code-collision checks during collective creation |
| `011_pending_member_visibility.sql` | Relaxes `collective_members` and `profiles` SELECT policies from `status = 'active'` to `status IN ('active', 'paused', 'pending')` — mid-week joiners have `pending` status until Monday and were invisible to the collective and to themselves. NOTE: introduced infinite recursion — fixed in 012 |
| `012_fix_recursion_from_011.sql` | Fixes infinite recursion (code 42P17) introduced by 011. Updates `get_user_collective_ids()` SECURITY DEFINER function to include `pending`/`paused` statuses (the intent of 011), then restores both `collective_members` and `profiles` SELECT policies to use that function instead of direct self-referencing subqueries |
| `013_collective_join_hardening.sql` | Closes the join-flow authorization hole (SECURITY-FINDINGS §1). `collectives` readable only by its own members; `collective_members` no longer client-writable. Adds `lookup_collective_by_code`, `join_collective_by_code`, `create_collective`, `pause_membership`, `resume_membership`, `leave_collective` as SECURITY DEFINER RPCs |
| `014_assignment_write_hardening.sql` | Closes the `weekly_assignments` write hole (decision 38): revokes blanket UPDATE from `authenticated`, grants only `(status, completed_at)`, adds the missing `WITH CHECK`, and adds `reschedule_assignment` so members can move a task within its own week |
| `015_age_verification.sql` | Adds `profiles.age_verified_at` and extends `handle_new_user()` to populate it from sign-up metadata (decision 39) |

**Two earlier migrations were repaired in place** (SECURITY-FINDINGS §4) because
neither had ever been applicable: `001` created a `collectives` policy before the
`collective_members` table it references, and `009` used a set-returning function
directly in a policy expression. Both errored on a fresh database. The chain
001 → 013 now applies cleanly to an empty database. An existing project is likely
missing 009's DELETE grant and policy — re-run it there.

---


## Not Built Yet (Future)

- Inter-collective leaderboard (achievements #32, #39 are placeholders)
- Paid bribery plan
- Real-world stakes
- Content moderation / report button
- Custom propaganda poster artwork (placeholders in v1)
- Socialist Realism trigger (#35)
- Multi-collective membership
- Edit Rooms screen (currently routes to create screen as placeholder)
- Holiday Pause task redistribution (DB flag set but tasks not yet redistributed)
- Achievement unlock animations (overlay exists and shows; animation on reveal not yet implemented)
- `peoples_communes` achievement has no event trigger — requires a time-based check (1 month active), not wired
- `rally_the_peasants` + `propaganda` achievements not triggerable — require invite tracking, no schema support
- Draft achievements (`production_team`, `production_brigade`, `planned_economy`) — need wiring inside `auto-assign` Edge Function
- `subscribeToDenouncments` not yet mounted in any component — when connected, must pass `userId` as second argument to enable resolution achievement checks
- Dev-only "Force Assign Tasks" button in Settings (`__DEV__` gated, never ships) — upserts a pending `draft_state` for the current week then calls `auto-assign` with `{ force: true }`. The Edge Function accepts `force: true` in the request body to bypass the Sunday/14:00 time check. **Currently non-functional:** `auto-assign` now requires the service role key (SECURITY-FINDINGS §2), which the client does not have and must not have. Invoke the function directly with the service role key when testing, or give it a dev-only path that is not reachable in production
- Account deletion: `task_preferences` rows not cleaned up, no 30-day grace period (`deleted_at` field exists in schema but is unused)