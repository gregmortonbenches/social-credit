import { CONFIG } from '../constants/config';

export interface Milestone {
  weeks: number;
  name: string;
}

export interface ProsperityStage {
  /** The highest milestone reached, or null before the first. */
  current: Milestone | null;
  /** The next one to reach, or null once the last is passed. */
  next: Milestone | null;
  weeksToNext: number | null;
  /** 0..1 of the way from `current` to `next`. 1 when there is no next. */
  progress: number;
}

export function prosperityStage(streak: number): ProsperityStage {
  const milestones: readonly Milestone[] = CONFIG.PROSPERITY_MILESTONES;
  const reached = milestones.filter((m) => streak >= m.weeks);
  const current = reached.length > 0 ? reached[reached.length - 1] : null;
  const next = milestones.find((m) => streak < m.weeks) ?? null;
  if (!next) return { current, next: null, weeksToNext: null, progress: 1 };

  const from = current?.weeks ?? 0;
  return {
    current,
    next,
    weeksToNext: next.weeks - streak,
    progress: (streak - from) / (next.weeks - from),
  };
}

export interface WeekProgress {
  total: number;
  done: number;
  overdue: number;
}

/**
 * Where this week stands against a perfect week. 'reassigned' duties went to
 * someone else, so they count neither way — the same rule weekly-reset applies.
 */
export function weekProgress(
  assignments: { status: string; due_date: string }[],
  now: Date = new Date()
): WeekProgress {
  const counted = assignments.filter((a) => a.status !== 'reassigned');
  return {
    total: counted.length,
    done: counted.filter((a) => a.status === 'complete').length,
    overdue: counted.filter((a) => a.status !== 'complete' && new Date(a.due_date) < now).length,
  };
}
