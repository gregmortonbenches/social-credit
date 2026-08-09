# Development Setup Guide

Complete step-by-step instructions for setting up Social Credit for development.

## Prerequisites

### Required
- **Node.js** 18+ ([download](https://nodejs.org/))
- **npm** (comes with Node)
- **Git** ([download](https://git-scm.com/))
- **Supabase account** (free tier sufficient, [sign up](https://supabase.com))

### Optional but Recommended
- **Expo Go app** on your phone (for testing on device)
- **Android Studio** (for Android emulator)
- **Xcode** (for iOS simulator, macOS only)
- **Visual Studio Code** with Expo extension

## Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/social-credit.git
cd social-credit
npm install
```

## Step 2: Set Up Supabase

### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose a name (e.g., "social-credit-dev")
4. Set a strong password
5. Choose a region close to you
6. Click "Create new project"

Wait for the project to initialize (2-3 minutes).

### Get Your Credentials

1. Go to **Settings** → **API**
2. Copy:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public` key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

### Set Up the Database

1. Go to the **SQL Editor**
2. Create a new query
3. Copy the contents of `supabase/migrations/001_initial_schema.sql`
4. Paste and run it
5. Repeat for each migration file in order: `002_`, `003_`, etc.

Or use the Supabase CLI:

```bash
supabase link --project-ref <your-project-id>
supabase migration up
```

## Step 3: Configure Environment Variables

Create `.env.local` in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
FCM_SERVER_KEY=
```

### Firebase Cloud Messaging (Optional)

For push notifications, you'll need FCM:

1. Create a [Firebase project](https://firebase.google.com/console)
2. Go to **Project Settings** → **Service Accounts**
3. Generate a new private key
4. Extract the `server_key` value
5. Add to `.env.local`:
   ```env
   FCM_SERVER_KEY=your-key-here
   ```

Without FCM, the app runs fine but notifications won't work.

## Step 4: Start Development

### Test TypeScript

```bash
npm run type-check
```

Should see "No errors!" at the end.

### Run the App

```bash
npm start
```

This opens the Expo CLI menu. Choose your platform:

- **`a`** — Android emulator
- **`i`** — iOS simulator (macOS only)
- **`w`** — Web browser
- **`j`** — Use Expo Go app (point phone camera at QR code)

### First-Time Experience

1. The app opens to the sign-up screen
2. Create an account with email/password
3. Complete age verification (must be 16+)
4. Go through the 3-slide onboarding
5. Create or join a collective (you can create one and invite yourself)

## Step 5: Local Supabase (Optional)

For offline development, run Supabase locally:

```bash
supabase start
```

This downloads Docker containers and starts:
- PostgreSQL database
- Supabase API
- Realtime
- Auth
- Vector

Access the dashboard at `http://localhost:54323`

To use local Supabase in your app, update `.env.local`:

```env
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # Use the key from http://localhost:54323
```

Stop with:

```bash
supabase stop
```

## Troubleshooting

### "Cannot find module '@supabase/supabase-js'"

```bash
npm install
```

### "TypeScript errors in VSCode"

Reload the TypeScript server: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"

### "Emulator won't start"

- **iOS:** Ensure Xcode is installed: `xcode-select --install`
- **Android:** Install Android Studio and create an emulator via Android Studio
- **Web:** Run with `npm run web` instead

### "Database migration fails"

Make sure you ran all migration files in order (001, 002, 003…). Check the Supabase SQL Editor for errors.

### "Can't sign in"

1. Verify `.env.local` has correct Supabase credentials
2. Check network connection
3. Try signing up instead — a new account might work if existing accounts are corrupted

### "Expo Go crashes when opening app"

- Make sure your phone and computer are on the same WiFi network
- Try `npm start` → `j` and scan the QR code again
- Restart Expo Go app

## Next Steps

1. Read `CLAUDE.md` for coding conventions
2. Read `CONTRIBUTING.md` for development workflow
3. Explore the codebase structure (see README)
4. Start with small features or bug fixes

## Getting Help

- Check existing GitHub issues
- Refer to [Expo docs](https://docs.expo.dev/)
- Refer to [Supabase docs](https://supabase.com/docs)
- Email greg@monwell.co.uk for project-specific questions

## Common Commands

```bash
# Development
npm start                    # Launch Expo CLI menu
npm run type-check           # Check TypeScript errors
npm run type-check:watch     # Watch for TypeScript errors

# Database
npm run db:push              # Push migrations to Supabase
npm run db:pull              # Pull schema from Supabase
npm run db:migrations:new     # Create new migration

# Supabase local
npm run supabase:start       # Start local Supabase stack
npm run supabase:stop        # Stop local Supabase stack
npm run functions:serve      # Develop Edge Functions locally
```

---

Happy coding! 🎉
