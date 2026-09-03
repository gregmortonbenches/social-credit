import { format as formatDate } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { CONFIG } from '../constants/config';

export function isAssignmentTime(collectiveTimezone: string): boolean {
  const local = toZonedTime(new Date(), collectiveTimezone);
  return local.getDay() === 0 && local.getHours() >= CONFIG.AUTO_ASSIGN_HOUR;
}

export function getNextAssignmentMs(collectiveTimezone: string): number {
  const now = new Date();
  const local = toZonedTime(now, collectiveTimezone);

  // On a Sunday before AUTO_ASSIGN_HOUR the next run is later *today*. The old
  // `(7 - day) % 7 || 7` collapsed that to 0 and then took the `|| 7` branch,
  // reporting a full week away all Sunday morning.
  const isSundayBeforeAssign =
    local.getDay() === 0 && local.getHours() < CONFIG.AUTO_ASSIGN_HOUR;
  const daysUntilSunday = isSundayBeforeAssign ? 0 : (7 - local.getDay()) % 7 || 7;

  const nextOpen = new Date(local);
  nextOpen.setDate(local.getDate() + daysUntilSunday);
  nextOpen.setHours(CONFIG.AUTO_ASSIGN_HOUR, 0, 0, 0);
  nextOpen.setMilliseconds(0);

  return fromZonedTime(nextOpen, collectiveTimezone).getTime() - now.getTime();
}

/** Human-readable "when do tasks arrive" string, e.g. "in 3 days" / "in 5 hours". */
export function formatNextAssignment(collectiveTimezone: string): string {
  const ms = getNextAssignmentMs(collectiveTimezone);
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'within the hour';
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}


// ---------------------------------------------------------------------------
// Collective-timezone calendar helpers
//
// The collective's timezone is the source of truth for all scheduling, so any
// question of the form "what day is this?" must be answered in it. The device's
// timezone is only ever correct by coincidence — a household in Europe/London
// with a comrade travelling in Tokyo would otherwise disagree about which day a
// task is due on, and about which week is the current one.
// ---------------------------------------------------------------------------

/** The calendar day an instant falls on, in the collective's timezone. */
export function collectiveDayKey(instant: Date, collectiveTimezone: string): string {
  return formatInTimeZone(instant, collectiveTimezone, 'yyyy-MM-dd');
}

/** Short weekday name for an instant, in the collective's timezone: "Wed". */
export function collectiveWeekdayShort(instant: Date, collectiveTimezone: string): string {
  return formatInTimeZone(instant, collectiveTimezone, 'EEE');
}

/** True when two instants fall on the same calendar day in the collective's timezone. */
export function isSameCollectiveDay(a: Date, b: Date, collectiveTimezone: string): boolean {
  return collectiveDayKey(a, collectiveTimezone) === collectiveDayKey(b, collectiveTimezone);
}

/**
 * The Monday that starts the current week, as a `yyyy-MM-dd` string in the
 * collective's timezone. This is what `weekly_assignments.week_start` holds, so
 * it is what the client must query on.
 *
 * Note this cannot be done with `toISOString()`: that re-converts to UTC, so for
 * any device behind UTC the last hours of each day yield tomorrow's date.
 */
export function collectiveWeekStart(collectiveTimezone: string, instant: Date = new Date()): string {
  const local = toZonedTime(instant, collectiveTimezone);
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday counts as the end of the week
  local.setDate(local.getDate() + diff);
  return formatDate(local, 'yyyy-MM-dd');
}

/** The exact instant the current week began — Monday 00:00 in the collective's timezone. */
export function collectiveWeekStartInstant(
  collectiveTimezone: string,
  instant: Date = new Date()
): Date {
  return fromZonedTime(
    `${collectiveWeekStart(collectiveTimezone, instant)}T00:00:00`,
    collectiveTimezone
  );
}
