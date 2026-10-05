import { prosperityStage, weekProgress } from '../lib/prosperity';
import { nextStreak, weekOutcome, weekStartKey } from '../supabase/functions/_shared/prosperity';

const done = { status: 'complete' };
const failed = { status: 'failed' };

describe('weekOutcome', () => {
  it('is perfect only when every duty is complete', () => {
    expect(weekOutcome([done, done, done], false)).toBe('perfect');
  });

  it('fails the week on a single missed duty', () => {
    expect(weekOutcome([done, done, failed], false)).toBe('failed');
  });

  it('fails a week whose duties were all done but a denouncement was upheld', () => {
    expect(weekOutcome([done, done], true)).toBe('failed');
  });

  it('is neither won nor lost with no duties at all', () => {
    expect(weekOutcome([], false)).toBe('empty');
    expect(weekOutcome([], true)).toBe('empty');
  });

  it('ignores reassigned duties either way', () => {
    expect(weekOutcome([done, { status: 'reassigned' }], false)).toBe('perfect');
    expect(weekOutcome([{ status: 'reassigned' }], false)).toBe('empty');
  });
});

describe('nextStreak', () => {
  it('adds a week for a perfect one', () => expect(nextStreak(3, 'perfect')).toBe(4));
  it('resets to zero on a failed week', () => expect(nextStreak(11, 'failed')).toBe(0));
  it('leaves the streak alone for an empty week', () => expect(nextStreak(5, 'empty')).toBe(5));
});

describe('weekStartKey', () => {
  // `localNow` is the collective's wall-clock time; only its calendar fields count.
  const mondayMidnight = new Date(2026, 9, 5, 0, 0); // Monday 5 Oct 2026

  it('names the week that just ended, from Monday 00:00', () => {
    expect(weekStartKey(mondayMidnight, -1)).toBe('2026-09-28');
  });

  it('names the week after the one that is starting', () => {
    expect(weekStartKey(mondayMidnight, 1)).toBe('2026-10-12');
  });

  it('is the same Monday for any time of that week', () => {
    expect(weekStartKey(new Date(2026, 9, 11, 23, 59), 0)).toBe('2026-10-05');
    expect(weekStartKey(new Date(2026, 9, 5, 0, 0), 0)).toBe('2026-10-05');
  });

  it('crosses month and year boundaries', () => {
    expect(weekStartKey(new Date(2027, 0, 4, 0, 0), -1)).toBe('2026-12-28');
  });
});

describe('prosperityStage', () => {
  it('has reached nothing at zero, and heads for the first milestone', () => {
    const s = prosperityStage(0);
    expect(s.current).toBeNull();
    expect(s.next?.weeks).toBe(1);
    expect(s.weeksToNext).toBe(1);
    expect(s.progress).toBe(0);
  });

  it('names the stage reached and measures progress to the next', () => {
    const s = prosperityStage(8); // between the 4-week and 12-week milestones
    expect(s.current?.weeks).toBe(4);
    expect(s.next?.weeks).toBe(12);
    expect(s.weeksToNext).toBe(4);
    expect(s.progress).toBeCloseTo(0.5);
  });

  it('counts a milestone as reached on the week itself', () => {
    expect(prosperityStage(4).current?.weeks).toBe(4);
  });

  it('has no next stage after the last', () => {
    const s = prosperityStage(60);
    expect(s.next).toBeNull();
    expect(s.weeksToNext).toBeNull();
    expect(s.progress).toBe(1);
  });
});

describe('weekProgress', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const past = '2026-10-06T12:00:00Z';
  const future = '2026-10-09T12:00:00Z';

  it('counts done, total and overdue, ignoring reassigned duties', () => {
    const p = weekProgress(
      [
        { status: 'complete', due_date: past },
        { status: 'pending', due_date: past },
        { status: 'pending', due_date: future },
        { status: 'reassigned', due_date: past },
      ],
      now
    );
    expect(p).toEqual({ total: 3, done: 1, overdue: 1 });
  });

  it('does not call a completed late duty overdue', () => {
    expect(weekProgress([{ status: 'complete', due_date: past }], now).overdue).toBe(0);
  });
});
