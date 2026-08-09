# Contributing to Social Credit

Thanks for your interest in contributing! This document outlines the development workflow and conventions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/social-credit.git`
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Set up environment (see README)
5. Make your changes
6. Commit with descriptive messages
7. Push to your fork and submit a pull request

## Development Workflow

### Setup for Development

```bash
npm install
npm start
```

### TypeScript & Linting

Ensure your code passes type checking:
```bash
npx tsc --noEmit
```

### Code Style

- Use TypeScript strictly (`strict: true` in tsconfig)
- Follow existing naming conventions
- Use descriptive variable names
- Keep functions focused and testable
- Add comments only for non-obvious logic

### Golden Rules

Read `CLAUDE.md` for the project's absolute rules. Key points when contributing:

1. **Config Values** — Never hardcode gameplay numbers. Use `CONFIG` from `constants/config.ts`
   ```ts
   // ✗ Don't do this
   const credits = 100;
   
   // ✓ Do this
   import { CONFIG } from '../constants/config';
   const credits = CONFIG.STARTING_CREDITS;
   ```

2. **Credit Transactions** — Always use the helper functions in `lib/credits.ts`
   ```ts
   // ✗ Don't do this
   await supabase.from('profiles').update({ total_credits: newAmount });
   
   // ✓ Do this
   import { awardTaskCredits } from '../lib/credits';
   await awardTaskCredits(userId, collectiveId, assignmentId, amount);
   ```

3. **Timezone** — Use collective's timezone, not device timezone
   ```ts
   // Use collective.timezone_iana from database
   const tz = collective.timezone_iana;
   const now = zonedTimeToUtc(new Date(), tz);
   ```

4. **Username Display** — Always prefix usernames with "Comrade", never show a raw one
   ```tsx
   // ✗ Don't do this
   <Text>{profile.username}</Text>

   // ✓ Do this
   <Text>Comrade {profile.username}</Text>
   ```

5. **Authentication & Security** — Never bypass Row Level Security (RLS)
   - Always use anon key for client code
   - Use service role only in Edge Functions for privileged operations
   - Verify collective membership via RLS, not client-side checks

## Database Changes

### Adding a Migration

```bash
supabase migration new add_my_feature
```

Edit the generated file in `supabase/migrations/`. Test locally:

```bash
supabase migration up
```

Push to remote:

```bash
supabase db push
```

### RLS Policies

Always add Row Level Security policies for new tables:

```sql
-- Example: Users can only read their own collective's data
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their collectives' data" ON my_table
  FOR SELECT USING (
    collective_id IN (
      SELECT collective_id FROM collective_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
```

## Edge Functions

### Adding a New Function

```bash
supabase functions new my_function
```

Test locally:

```bash
supabase start
supabase functions serve
```

Deploy:

```bash
supabase functions deploy my_function
```

### Cron Jobs

Schedule functions with the `--name` flag:

```bash
supabase secrets set CRON_SECRET=your-secret
```

Then in your function:

```ts
export const config = { secrets: ['CRON_SECRET'] };

export default async (req: Request) => {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // Your cron logic here
};
```

## Testing

There is no automated test suite yet. Before opening a PR, run the type checker:

```bash
npm run type-check
```

Manual testing on devices:

```bash
npm run ios      # iOS simulator
npm run android  # Android emulator
npm run web      # Web browser
```

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add weekly scoreboard leaderboard

- Display top 3 users by credits
- Sort by total_credits DESC
- Update every 10 seconds via Realtime subscription
```

Prefixes:
- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code cleanup (no behavior change)
- `docs:` — Documentation
- `style:` — Formatting (no logic change)
- `test:` — Test additions/fixes
- `chore:` — Dependency updates, config changes

## Pull Request Process

1. Ensure all changes pass TypeScript: `npx tsc --noEmit`
2. Update README if you're adding new features
3. Link any related issues: "Fixes #123"
4. Write a clear PR description explaining what and why
5. Request review from maintainers
6. Address feedback with new commits (don't force-push)

## Areas That Need Help

- **Mobile UI polish** — Layout tweaks, animations, responsive design
- **Accessibility** — Screen reader support, keyboard navigation
- **Documentation** — API docs, architecture guides
- **Achievements** — Design new badge types and unlock conditions
- **Performance** — Optimize queries, reduce rerenders
- **Tests** — Add unit tests for critical logic

## Questions?

Open an issue or reach out to the maintainer at greg@monwell.co.uk

---

**Remember: Read CLAUDE.md before making changes.** It contains crucial conventions that keep the codebase maintainable.
