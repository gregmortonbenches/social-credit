import { ACHIEVEMENTS } from '../constants/achievements';
import {
  ACHIEVEMENT_CATEGORY,
  keysForEvent,
  taskCompleteFacts,
  type TaskFactsInput,
} from '../supabase/functions/_shared/achievements';

describe('server achievement catalogue', () => {
  it('has exactly the keys and categories the app shows', () => {
    const app = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a.category]));
    expect(ACHIEVEMENT_CATEGORY).toEqual(app);
  });

  it('only ever unlocks keys that exist', () => {
    const everything = {
      totalCompleted: 99, weeklyCompleted: 9, isFirstInCollective: true, roomType: 'kitchen',
      kitchenCount: 99, roomTypeCount: 99, allRoomTypesCovered: true, noMissStreak: 99,
      taskStreak: 99, isTopScorer: true, topScorerWeeks: 9, isCustomTask: true,
      isOwnProposal: true, allMembersCompleted: true, collectiveQuotaReached: true,
      noDenounceStreak: 9, allCategoriesUnlocked: true, outcome: 'dismissed',
      sameAccusedAsPreviousAccuser: true, wasAccused: true, totalInvolvements: 9,
      allVotedDismiss: true, selfDefenceWon: true, totalVotes: 9, allMembersVoted: true,
      totalDrafts: 99, firstPicker: true, memberCount: 9, monthsActive: 9,
      invitedByUser: true, isSecondCollective: true, completedAllAfterReturn: true,
    };
    const types = ['task_complete', 'denounce_made', 'denounce_resolved', 'vote_cast',
      'draft_complete', 'member_joined', 'holiday_returned'] as const;
    for (const t of types) {
      for (const k of keysForEvent(t, everything)) expect(ACHIEVEMENT_CATEGORY[k]).toBeDefined();
    }
  });
});

describe('keysForEvent', () => {
  it('unlocks the first-task badge and nothing more for a single completion', () => {
    expect(keysForEvent('task_complete', { totalCompleted: 1, weeklyCompleted: 1 })).toEqual(['class_struggle']);
  });

  it('needs a kitchen for the kitchen badge', () => {
    expect(keysForEvent('task_complete', { totalCompleted: 10, roomType: 'bathroom', kitchenCount: 10 }))
      .not.toContain('backyard_furnace');
    expect(keysForEvent('task_complete', { totalCompleted: 10, roomType: 'kitchen', kitchenCount: 10 }))
      .toContain('backyard_furnace');
  });

  it('awards purge only on an upheld case', () => {
    expect(keysForEvent('denounce_made', { outcome: null })).toEqual([]);
    expect(keysForEvent('denounce_made', { outcome: 'upheld' })).toEqual(['purge_the_bourgeoisie']);
  });

  it('awards the two self-defence badges together', () => {
    expect(keysForEvent('denounce_resolved', { outcome: 'dismissed', selfDefenceWon: true }))
      .toEqual(['reeducation_through_labour', 'workers_faculties']);
  });
});

// Instants before this Monday belong to the previous week; the rest to this one.
const weekStartOf = (instant: Date) =>
  instant.toISOString().slice(0, 10) < '2026-10-19' ? '2026-10-12' : '2026-10-19';

function base(over: Partial<TaskFactsInput> = {}): TaskFactsInput {
  return {
    userId: 'me',
    weekStart: '2026-10-19',
    task: { room_type: 'kitchen', is_custom: true },
    userAssignments: [{ week_start: '2026-10-19', status: 'complete', task_id: 't1' }],
    weekAssignments: [{ user_id: 'me', status: 'complete', credits_value: 100 }],
    collectiveCompletedCount: 1,
    activeMemberIds: ['me'],
    denouncementDates: [],
    recentCredits: [],
    roomTypeByTaskId: { t1: 'kitchen' },
    collectiveRooms: ['kitchen'],
    existingKeys: new Set(),
    weekStartOf,
    ...over,
  };
}

describe('taskCompleteFacts', () => {
  it('spots the first completion in a collective', () => {
    expect(taskCompleteFacts(base()).isFirstInCollective).toBe(true);
    expect(taskCompleteFacts(base({ collectiveCompletedCount: 2 })).isFirstInCollective).toBe(false);
  });

  it('counts consecutive weeks with a completion, latest first', () => {
    const facts = taskCompleteFacts(base({
      userAssignments: [
        { week_start: '2026-10-19', status: 'complete', task_id: 't1' },
        { week_start: '2026-10-12', status: 'complete', task_id: 't1' },
        { week_start: '2026-10-05', status: 'failed', task_id: 't1' },
        { week_start: '2026-09-28', status: 'complete', task_id: 't1' },
      ],
    }));
    expect(facts.taskStreak).toBe(2);
    expect(facts.noMissStreak).toBe(2);
  });

  it('covers every room only when each live space has a completion', () => {
    expect(taskCompleteFacts(base({ collectiveRooms: ['kitchen', 'bathroom'] })).allRoomTypesCovered).toBe(false);
    expect(taskCompleteFacts(base({
      collectiveRooms: ['kitchen', 'bathroom'],
      userAssignments: [
        { week_start: '2026-10-19', status: 'complete', task_id: 't1' },
        { week_start: '2026-10-19', status: 'complete', task_id: 't2' },
      ],
      roomTypeByTaskId: { t1: 'kitchen', t2: 'bathroom' },
    })).allRoomTypesCovered).toBe(true);
    expect(taskCompleteFacts(base({ collectiveRooms: [] })).allRoomTypesCovered).toBe(false);
  });

  it('is top scorer only when nobody else earned more this week', () => {
    const credits = (other: number) => [
      { user_id: 'me', delta: 100, created_at: '2026-10-20T10:00:00Z' },
      { user_id: 'you', delta: other, created_at: '2026-10-20T10:00:00Z' },
    ];
    expect(taskCompleteFacts(base({ activeMemberIds: ['me', 'you'], recentCredits: credits(50) })).isTopScorer).toBe(true);
    expect(taskCompleteFacts(base({ activeMemberIds: ['me', 'you'], recentCredits: credits(150) })).isTopScorer).toBe(false);
  });

  it('reaches the quota only when every duty this week is complete', () => {
    expect(taskCompleteFacts(base()).collectiveQuotaReached).toBe(true);
    expect(taskCompleteFacts(base({
      weekAssignments: [
        { user_id: 'me', status: 'complete', credits_value: 100 },
        { user_id: 'me', status: 'pending', credits_value: 100 },
      ],
    })).collectiveQuotaReached).toBe(false);
  });

  it('has no denounce streak while a denouncement lands in the latest week', () => {
    expect(taskCompleteFacts(base({ denouncementDates: ['2026-10-20T09:00:00Z'] })).noDenounceStreak).toBe(0);
    expect(taskCompleteFacts(base()).noDenounceStreak).toBe(1);
  });

  it('needs a badge from every category for the finale', () => {
    const one = (c: string) => Object.keys(ACHIEVEMENT_CATEGORY).find((k) => ACHIEVEMENT_CATEGORY[k] === c)!;
    const three = new Set([one('cleaning'), one('longevity'), one('interaction')]);
    expect(taskCompleteFacts(base({ existingKeys: three })).allCategoriesUnlocked).toBe(false);
    three.add(one('collective'));
    expect(taskCompleteFacts(base({ existingKeys: three })).allCategoriesUnlocked).toBe(true);
  });
});
