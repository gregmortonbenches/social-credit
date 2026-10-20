import { useAchievementStore } from '../store/useAchievementStore';
import { supabase } from './supabase';

/**
 * Achievements are awarded by the `award-achievements` Edge Function, not here.
 * The `achievements` table is read-only to the app, so a client could otherwise
 * hand itself any badge. We say only WHAT happened (an event and the ids it
 * concerns); the server checks the user really is party to it, reads every fact
 * from the database and applies the rules (supabase/functions/_shared/achievements.ts).
 */
export type AchievementEvent =
  | { type: 'task_complete'; collectiveId: string; assignmentId: string }
  | { type: 'denounce_made' | 'denounce_resolved' | 'vote_cast'; collectiveId: string; denouncementId: string }
  | { type: 'member_joined'; collectiveId: string };

/** Asks the server to evaluate an event; resolves to the keys newly unlocked. */
export async function checkAchievements(event: AchievementEvent): Promise<string[]> {
  const { type, ...ids } = event;
  const { data, error } = await supabase.functions.invoke('award-achievements', {
    body: { event: type, ...ids },
  });
  if (error) throw error;
  return (data?.unlocked as string[] | undefined) ?? [];
}

/**
 * Fire-and-forget: evaluate an event and queue the unlock stamp. A failed check
 * must never fail the action that caused it, so errors are only logged in dev.
 */
export function announceAchievements(event: AchievementEvent): Promise<void> {
  return checkAchievements(event)
    .then((unlocked) => {
      if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked);
    })
    .catch((err) => {
      if (__DEV__) console.warn('[achievements] check failed:', err?.message ?? err);
    });
}
