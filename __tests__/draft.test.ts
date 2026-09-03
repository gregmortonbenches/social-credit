import {
  collectiveDayKey,
  collectiveWeekStart,
  collectiveWeekStartInstant,
  collectiveWeekdayShort,
  formatNextAssignment,
  getNextAssignmentMs,
  isSameCollectiveDay,
} from '../lib/draft';

/**
 * These helpers answer "what day is it" for scheduling, and every one of them
 * replaced an implementation that used the device clock. The property that
 * matters is that the answer depends on the COLLECTIVE's timezone and not on
 * whose phone is asking — so most of these assert an exact value that must hold
 * regardless of where the test runs.
 */

const LONDON = 'Europe/London';
const NY = 'America/New_York';
const TOKYO = 'Asia/Tokyo';

describe('collectiveWeekStart', () => {
  it('treats Sunday as the end of the week, not the start', () => {
    // Sun 2026-09-06 23:30 London — still the week beginning Mon 31 Aug
    expect(collectiveWeekStart(LONDON, new Date('2026-09-06T22:30:00Z'))).toBe('2026-08-31');
  });

  it('rolls over at local midnight on Monday', () => {
    expect(collectiveWeekStart(LONDON, new Date('2026-09-06T23:30:00Z'))).toBe('2026-09-07');
  });

  it('does not drift to the next day for a timezone behind UTC', () => {
    // Mon 2026-09-07 20:00 in New York. The previous implementation ran a
    // device-local date through toISOString() and returned the Tuesday, which
    // matched no week_start row at all and emptied the task list every evening.
    expect(collectiveWeekStart(NY, new Date('2026-09-08T00:00:00Z'))).toBe('2026-09-07');
  });

  it('is decided by the collective timezone, not the instant alone', () => {
    const t = new Date('2026-09-07T00:30:00Z'); // Mon in London, still Sun in LA
    expect(collectiveWeekStart(LONDON, t)).toBe('2026-09-07');
    expect(collectiveWeekStart('America/Los_Angeles', t)).toBe('2026-08-31');
  });
});

describe('collectiveWeekStartInstant', () => {
  it('is local midnight Monday, offset by the zone', () => {
    const mid = new Date('2026-09-10T12:00:00Z');
    // BST is UTC+1, so Monday 00:00 London is 23:00Z the previous day
    expect(collectiveWeekStartInstant(LONDON, mid).toISOString()).toBe('2026-09-06T23:00:00.000Z');
    // JST is UTC+9
    expect(collectiveWeekStartInstant(TOKYO, mid).toISOString()).toBe('2026-09-06T15:00:00.000Z');
  });
});

describe('collectiveDayKey / isSameCollectiveDay', () => {
  it('buckets an instant by the collective calendar', () => {
    const satNight = new Date('2026-09-05T22:59:00Z'); // Sat 23:59 London
    expect(collectiveDayKey(satNight, LONDON)).toBe('2026-09-05');
    expect(collectiveDayKey(satNight, TOKYO)).toBe('2026-09-06');
  });

  it('treats a deadline and the current moment as the same day correctly', () => {
    const due = new Date('2026-09-06T22:59:00Z'); // Sun 23:59 London
    const now = new Date('2026-09-06T19:00:00Z'); // Sun 20:00 London
    expect(isSameCollectiveDay(due, now, LONDON)).toBe(true);
  });

  it('separates days that only differ once the zone is applied', () => {
    const a = new Date('2026-09-06T22:00:00Z'); // Sun 23:00 London
    const b = new Date('2026-09-06T23:30:00Z'); // Mon 00:30 London
    expect(isSameCollectiveDay(a, b, LONDON)).toBe(false);
    // ...but both are already Monday in Tokyo
    expect(isSameCollectiveDay(a, b, TOKYO)).toBe(true);
  });
});

describe('collectiveWeekdayShort', () => {
  it('names the day in the collective zone', () => {
    expect(collectiveWeekdayShort(new Date('2026-09-09T12:00:00Z'), LONDON)).toBe('Wed');
  });
});

describe('getNextAssignmentMs', () => {
  it('is always within the coming week', () => {
    const ms = getNextAssignmentMs(LONDON);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);
  });

  it('reports later today on a Sunday morning, not next week', () => {
    // The old `(7 - day) % 7 || 7` collapsed to 0 on a Sunday and then took the
    // `|| 7` branch, claiming a full week away all Sunday morning.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-06T08:00:00Z')); // Sun 09:00 London
    try {
      const hours = getNextAssignmentMs(LONDON) / 3_600_000;
      expect(hours).toBeLessThan(24);
      expect(formatNextAssignment(LONDON)).toMatch(/hour/);
    } finally {
      jest.useRealTimers();
    }
  });
});
