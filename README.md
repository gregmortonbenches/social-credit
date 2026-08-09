# Social Credit

A gamified credit system mobile app for households ("Collectives") to manage domestic tasks through a playful credit economy inspired by Communist propaganda aesthetics.

## Features

- **Task Management** — Assign, complete, and track household chores with deadline management
- **Credit Economy** — Earn and lose credits for task completion/failure with configurable rewards
- **Social Gameplay** — "Denounce!" other members for shirking duties with voting and response mechanics
- **Weekly Scoreboards** — Compete with housemates on competitive leaderboards
- **Achievements** — Unlock badges and milestones through gameplay
- **Realtime Sync** — Live updates across all household members via Supabase Realtime
- **Push Notifications** — FCM-powered notifications for task reminders and social events
- **Multi-Auth** — Email/password, Google, and Apple Sign-In support

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | React Native + Expo (iOS/Android/Web) |
| **Language** | TypeScript |
| **Routing** | Expo Router |
| **Styling** | NativeWind (Tailwind CSS) |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth + OAuth |
| **Realtime** | Supabase Realtime subscriptions |
| **Scheduled Jobs** | Supabase Edge Functions (cron) |
| **Push Notifications** | Firebase Cloud Messaging (delivery only) |
| **State Management** | Zustand + AsyncStorage |

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- Supabase account (free tier supported)
- Firebase project for FCM (optional, for push notifications)

### Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/yourusername/social-credit.git
   cd social-credit
   npm install
   ```

2. **Environment configuration:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase and FCM credentials:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   FCM_SERVER_KEY=your-fcm-server-key
   ```

3. **Run the app:**
   ```bash
   npm start          # Interactive Expo menu
   npm run ios        # iOS simulator
   npm run android    # Android emulator
   npm run web        # Web browser
   ```

## Project Structure

```
app/                          # Expo Router screens
  (auth)/                     # Authentication screens
  (onboarding)/              # Welcome flow
  (app)/                     # Main app screens
    index.tsx                # 3-panel swipeable home
    achievements.tsx         # Achievement browser
    settings.tsx             # User settings
    collective/              # Collective management screens

components/
  tasks/                     # Task cards and management
  collective/                # Scoreboard, collective UI
  denouncements/             # Denounce system UI
  achievements/              # Badge display
  ui/                        # Shared primitives

constants/
  config.ts                  # All tunable gameplay values
  theme.ts                   # Colors and typography
  tasks.ts                   # Default tasks
  achievements.ts            # Achievement definitions
  proverbs.ts               # Chinese proverbs for UI copy

lib/
  supabase.ts               # Supabase client init
  credits.ts                # Credit award/deduction logic
  achievements.ts           # Achievement checking
  draft.ts                  # Task scheduling helpers
  notifications.ts          # FCM integration
  database.types.ts         # Generated TypeScript types

store/                       # Zustand stores with persistence
  useAuthStore.ts
  useCollectiveStore.ts
  useTaskStore.ts
  useDenouncementStore.ts
  useAchievementStore.ts

supabase/
  migrations/               # Database schema
  functions/                # Edge Functions (cron jobs)
```

## Core Concepts

### Credit System

All gameplay revolves around a credit economy:
- **Starting balance:** 500 credits
- **Weekly pool:** 1000 new credits distributed
- **Task rewards:** Configurable per task
- **Penalties:** Failure, late completion, denouncements
- **Ledger:** All changes are immutable in `credit_ledger` table

**Golden Rule:** Never update `profiles.total_credits` directly. Always append to `credit_ledger`.

### Collectives

A "Collective" is a household group. Features:
- Up to 100 members
- Shared task pool with individual assignment
- Weekly reset of scoreboards
- Custom credit values and penalties
- Invite links for easy joining

### Draft & Assignment System

Tasks are assigned via a "draft" window:
- Sunday 2 PM (collective timezone) — auto-assignment runs
- Members can bid on tasks or have them auto-assigned
- Draft window closes 24 hours later
- Configurable per collective

### Denouncements

Members can publicly "Denounce!" shirkers:
- Accuser gains 100 credits if accusation upheld
- Response window: 24 hours for accused to defend
- Voting by other members determines outcome
- Abuse protection: 2+ denunciations in 60 days = 150 credit penalty

### Achievements

Badges unlock for reaching milestones:
- Locked achievements don't reveal title/description (spoiler protection)
- Unlock events trigger persistent overlay notifications
- Achievements are permanent once unlocked
- Categories: credits, tasks, social, streaks

## Database

### Key Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User identity and aggregated stats |
| `collectives` | Household groups and settings |
| `collective_members` | Membership with roles and status |
| `tasks` | Task definitions per collective |
| `weekly_assignments` | Task-to-member assignments |
| `credit_ledger` | Immutable transaction log |
| `credit_balances` | Cached `total_credits` per user |
| `denouncements` | Public accusations |
| `denunciation_votes` | Voting on accusations |
| `achievements` | Achievement definitions |
| `achievement_unlocks` | Per-user unlock records |

### Schemas

See `supabase/migrations/` for complete SQL. All tables use RLS (Row Level Security):
- Users can only read/write data from collectives they're members of
- Admins can bypass RLS with service role

## APIs & Integrations

### Supabase

- **Auth:** Email/password, Google OAuth, Apple Sign-In
- **Realtime:** Live scoreboards, notifications, member status
- **Edge Functions:** Scheduled cron jobs (weekly reset, timeouts)

### Firebase Cloud Messaging

Only used for push delivery (no Firestore/Firebase Auth):
- `firebase-admin` SDK sends messages from Edge Functions
- Token management via Expo Notifications
- Device quiet hours respected

## Rules & Conventions

**Read CLAUDE.md for comprehensive working conventions.** Key points:

1. **No hardcoded gameplay values** — import `CONFIG` from `constants/config.ts`
2. **All credit changes go to `credit_ledger`** — never write directly to `total_credits`
3. **Timezone is collective's IANA timezone** — not device timezone
4. **Always escape HTML** — use `escapeHtml()` for user-supplied content
5. **RLS always enforced** — never bypass row-level security
6. **Age gate required** — sign-up must verify age 16+
7. **Achievements hidden until unlock** — no peeking at locked achievements

## Development

### Pre-commit Checks

```bash
npm run type-check      # TypeScript validation
npm run lint            # ESLint
```

### Database Migrations

After schema changes:
```bash
supabase migration new <name>
supabase migration up
```

Push migrations to Supabase:
```bash
supabase db push
```

### Edge Functions

Edit files in `supabase/functions/`. Deploy with:
```bash
supabase functions deploy <function-name>
```

## Deployment

### Build & Release

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

### Push to Production

```bash
eas submit --platform ios --latest
eas submit --platform android --latest
```

See `eas.json` for build profiles.

## Contributing

This is a personal project. For major changes, open an issue or reach out to the maintainer.

## License

Private project. Not for commercial use without permission.

## Support

For bugs, feature requests, or questions:
- Open an issue on GitHub
- Email: greg@monwell.co.uk

---

**Built with ❤️ and propaganda aesthetics**
