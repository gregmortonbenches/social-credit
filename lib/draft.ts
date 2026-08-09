import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { CONFIG } from '../constants/config';

export function isAssignmentTime(collectiveTimezone: string): boolean {
  const local = toZonedTime(new Date(), collectiveTimezone);
  return local.getDay() === 0 && local.getHours() >= CONFIG.AUTO_ASSIGN_HOUR;
}

export function getNextAssignmentMs(collectiveTimezone: string): number {
  const now = new Date();
  const local = toZonedTime(now, collectiveTimezone);

  const daysUntilSunday = (7 - local.getDay()) % 7 || 7;

  const nextOpen = new Date(local);
  nextOpen.setDate(local.getDate() + daysUntilSunday);
  nextOpen.setHours(CONFIG.AUTO_ASSIGN_HOUR, 0, 0, 0);
  nextOpen.setMilliseconds(0);

  return fromZonedTime(nextOpen, collectiveTimezone).getTime() - now.getTime();
}
