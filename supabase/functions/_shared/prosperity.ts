// Pure rules for the Collective's prosperity streak. No Deno or network imports,
// so Jest can exercise them (__tests__/prosperity.test.ts) — the decisions that
// matter here are easy to get quietly wrong and impossible to notice until a
// household's streak resets for no reason.

export interface WeekAssignment {
  status: string;
}

export type WeekOutcome = 'perfect' | 'failed' | 'empty';

/**
 * A week is perfect only if every duty was completed and no denouncement was
 * upheld. A week with no duties at all is neither: a new Collective, or one
 * between assignments, has nothing to fulfil or to fail. 'reassigned' rows were
 * handed to someone else (Holiday Pause), so they are not counted either way.
 */
export function weekOutcome(
  assignments: WeekAssignment[],
  hasUpheldDenouncement: boolean
): WeekOutcome {
  const counted = assignments.filter((a) => a.status !== 'reassigned');
  if (counted.length === 0) return 'empty';
  if (hasUpheldDenouncement) return 'failed';
  return counted.every((a) => a.status === 'complete') ? 'perfect' : 'failed';
}

export function nextStreak(current: number, outcome: WeekOutcome): number {
  if (outcome === 'perfect') return current + 1;
  if (outcome === 'failed') return 0;
  return current;
}

/**
 * yyyy-MM-dd of the Monday `weeksFromNow` weeks from the Monday that `localNow`
 * falls on. Pass a date already shifted into the collective's timezone (the
 * result of date-fns-tz `toZonedTime`) — only its calendar fields are read.
 *
 * weekly-reset runs at Monday 00:00 in the collective's timezone, so `localNow`
 * IS the Monday that starts the new week: -1 is the week that just ended, +1 is
 * the week whose tasks are assigned next Sunday. Computing these from the UTC
 * date instead went wrong for any collective at or west of UTC, where Monday
 * 00:00 local is already Monday in UTC.
 */
export function weekStartKey(localNow: Date, weeksFromNow: number): string {
  const d = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate());
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday + 7 * weeksFromNow);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
