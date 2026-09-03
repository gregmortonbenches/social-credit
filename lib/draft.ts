import { fromZonedTime, toZonedTime } from 'date-fns-tz';
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
