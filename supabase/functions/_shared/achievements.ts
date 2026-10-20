// Pure rules for achievements. No Deno or network imports, so Jest can exercise
// them (__tests__/achievements.test.ts).
//
// Achievements are awarded by the `award-achievements` Edge Function, never by the
// client: the client sends only an event type and ids, the function reads every fact
// from the database, and these functions decide what unlocked. The table is
// read-only to the app (migration 005), so a user cannot award themselves a badge.
//
// ACHIEVEMENT_CATEGORY mirrors constants/achievements.ts; a test asserts the two
// stay in step.

export type AchievementCategory = 'cleaning' | 'longevity' | 'interaction' | 'collective';

export const ACHIEVEMENT_CATEGORY: Record<string, AchievementCategory> = {
  class_struggle: 'cleaning',
  westward_expansion: 'cleaning',
  eastward_expansion: 'cleaning',
  struggle_sessions: 'cleaning',
  hero_of_the_people: 'cleaning',
  backyard_furnace: 'cleaning',
  iron_rice_bowl: 'cleaning',
  reeducation_through_labour: 'cleaning',
  hundred_flowers: 'cleaning',
  ten_great_constructions: 'cleaning',
  long_march: 'longevity',
  peoples_communes: 'longevity',
  production_team: 'longevity',
  three_anti_campaign: 'longevity',
  gang_of_four: 'longevity',
  five_year_plan: 'longevity',
  production_brigade: 'longevity',
  land_reform: 'longevity',
  continuous_revolution: 'longevity',
  sino_soviet_split: 'longevity',
  know_the_enemy: 'interaction',
  purge_the_bourgeoisie: 'interaction',
  planned_economy: 'interaction',
  cultural_revolution: 'interaction',
  party_leadership: 'interaction',
  workers_faculties: 'interaction',
  united_front: 'interaction',
  self_reliance: 'interaction',
  patriotic_war: 'interaction',
  double_agents: 'interaction',
  rally_the_peasants: 'collective',
  collectivisation: 'collective',
  mass_line: 'collective',
  household_responsibility: 'collective',
  socialist_realism: 'collective',
  young_pioneers: 'collective',
  propaganda: 'collective',
  special_economic_zones: 'collective',
  reform_and_opening_up: 'collective',
  four_modernisations: 'collective',
};

export type AchievementEventType =
  | 'task_complete'
  | 'denounce_made'
  | 'denounce_resolved'
  | 'vote_cast'
  | 'draft_complete'
  | 'member_joined'
  | 'holiday_returned';

/** Which keys an event's facts unlock. Callers drop the ones already held. */
export function keysForEvent(type: AchievementEventType, p: Record<string, any>): string[] {
  const keys: string[] = [];
  const add = (cond: unknown, key: string) => { if (cond) keys.push(key); };

  switch (type) {
    case 'task_complete':
      add(p.totalCompleted >= 1, 'class_struggle');
      add(p.totalCompleted >= 10, 'ten_great_constructions');
      add(p.weeklyCompleted >= 3, 'struggle_sessions');
      add(p.isFirstInCollective, 'young_pioneers');
      add(p.roomType === 'kitchen' && (p.kitchenCount ?? 0) >= 10, 'backyard_furnace');
      add((p.roomTypeCount ?? 0) >= 5, 'eastward_expansion');
      add(p.allRoomTypesCovered, 'westward_expansion');
      add((p.noMissStreak ?? 0) >= 4, 'iron_rice_bowl');
      add((p.noMissStreak ?? 0) >= 8, 'continuous_revolution');
      add((p.taskStreak ?? 0) >= 6, 'long_march');
      add((p.taskStreak ?? 0) >= 5, 'five_year_plan');
      add(p.isTopScorer, 'hero_of_the_people');
      add(p.topScorerWeeks >= 3, 'party_leadership');
      add(p.isCustomTask, 'hundred_flowers');
      add(p.isOwnProposal, 'self_reliance');
      add(p.allMembersCompleted, 'household_responsibility');
      add(p.collectiveQuotaReached, 'collectivisation');
      add((p.noDenounceStreak ?? 0) >= 3, 'three_anti_campaign');
      add(p.allCategoriesUnlocked, 'four_modernisations');
      break;
    case 'denounce_made':
      add(p.outcome === 'upheld', 'purge_the_bourgeoisie');
      add(p.sameAccusedAsPreviousAccuser, 'double_agents');
      break;
    case 'denounce_resolved':
      add(p.wasAccused, 'know_the_enemy');
      add(p.outcome === 'dismissed' && p.selfDefenceWon, 'reeducation_through_labour');
      add(p.outcome === 'dismissed' && p.selfDefenceWon, 'workers_faculties');
      add(p.allVotedDismiss, 'patriotic_war');
      add(p.totalInvolvements >= 5, 'cultural_revolution');
      break;
    case 'vote_cast':
      add(p.totalVotes >= 1, 'united_front');
      add(p.allMembersVoted, 'mass_line');
      break;
    case 'draft_complete':
      add(p.totalDrafts >= 3, 'production_team');
      add(p.totalDrafts >= 10, 'production_brigade');
      add(p.firstPicker, 'planned_economy');
      break;
    case 'member_joined':
      add(p.memberCount >= 4, 'gang_of_four');
      add((p.monthsActive ?? 0) >= 1, 'peoples_communes');
      add(p.invitedByUser, 'rally_the_peasants');
      add(p.invitedByUser, 'propaganda');
      add(p.isSecondCollective, 'sino_soviet_split');
      break;
    case 'holiday_returned':
      add(p.completedAllAfterReturn, 'land_reform');
      break;
  }
  return keys;
}

export interface TaskFactsInput {
  userId: string;
  /** The assignment that was just completed. */
  weekStart: string;
  task: { room_type: string; is_custom: boolean } | null;
  /** All of this user's assignments in the collective. */
  userAssignments: { week_start: string; status: string; task_id: string }[];
  /** Everyone's assignments for `weekStart`. */
  weekAssignments: { user_id: string; status: string; credits_value: number | null }[];
  collectiveCompletedCount: number;
  activeMemberIds: string[];
  /** Created-at instants of denouncements against this user. */
  denouncementDates: string[];
  /** Positive task_complete ledger rows from the last four weeks. */
  recentCredits: { user_id: string; delta: number; created_at: string }[];
  roomTypeByTaskId: Record<string, string>;
  /** room_type of each of the collective's live tasks. */
  collectiveRooms: string[];
  existingKeys: Set<string>;
  /** Monday (yyyy-MM-dd) of the collective-local week containing the instant. */
  weekStartOf: (instant: Date) => string;
}

/** The facts behind every task-completion achievement, from rows already fetched. */
export function taskCompleteFacts(i: TaskFactsInput): Record<string, unknown> {
  const userCompleted = i.userAssignments.filter((a) => a.status === 'complete');
  const totalCompleted = userCompleted.length;
  const weeklyCompleted = i.weekAssignments.filter(
    (a) => a.user_id === i.userId && a.status === 'complete'
  ).length;
  const isFirstInCollective = i.collectiveCompletedCount === 1;

  const roomType = i.task?.room_type ?? null;
  const roomTypeCounts: Record<string, number> = {};
  for (const a of userCompleted) {
    const rt = i.roomTypeByTaskId[a.task_id];
    if (rt) roomTypeCounts[rt] = (roomTypeCounts[rt] ?? 0) + 1;
  }
  const covered = new Set(Object.keys(roomTypeCounts));
  const allRoomTypesCovered =
    i.collectiveRooms.length > 0 && i.collectiveRooms.every((rt) => covered.has(rt));

  // Streaks walk this user's weeks from the latest backwards.
  const weekMap: Record<string, { hasComplete: boolean; hasFailed: boolean }> = {};
  for (const a of i.userAssignments) {
    const w = (weekMap[a.week_start] ??= { hasComplete: false, hasFailed: false });
    if (a.status === 'complete') w.hasComplete = true;
    if (a.status === 'failed') w.hasFailed = true;
  }
  const weeks = Object.keys(weekMap).sort().reverse();
  const run = (ok: (w: string) => boolean) => {
    let n = 0;
    for (const w of weeks) { if (ok(w)) n++; else break; }
    return n;
  };
  const taskStreak = run((w) => weekMap[w].hasComplete);
  const noMissStreak = run((w) => !weekMap[w].hasFailed);
  const denouncedWeeks = new Set(i.denouncementDates.map((d) => i.weekStartOf(new Date(d))));
  const noDenounceStreak = run((w) => !denouncedWeeks.has(w));

  // Top scorer, from the ledger.
  const weeklyCredits: Record<string, Record<string, number>> = {};
  for (const row of i.recentCredits) {
    const w = i.weekStartOf(new Date(row.created_at));
    const week = (weeklyCredits[w] ??= {});
    week[row.user_id] = (week[row.user_id] ?? 0) + row.delta;
  }
  const beatsEveryone = (wc: Record<string, number>) => {
    const mine = wc[i.userId] ?? 0;
    return i.activeMemberIds.every((m) => m === i.userId || (wc[m] ?? 0) <= mine);
  };
  const isTopScorer =
    i.activeMemberIds.length > 0 && beatsEveryone(weeklyCredits[i.weekStart] ?? {});
  let topScorerWeeks = 0;
  for (const w of Object.keys(weeklyCredits).sort().reverse()) {
    const wc = weeklyCredits[w];
    if ((wc[i.userId] ?? 0) > 0 && beatsEveryone(wc)) topScorerWeeks++;
    else break;
  }

  const allMembersCompleted = i.activeMemberIds.every((m) => {
    const mine = i.weekAssignments.filter((a) => a.user_id === m);
    return mine.length > 0 && mine.every((a) => a.status === 'complete');
  });

  const totalExpected = i.weekAssignments.reduce((s, a) => s + (a.credits_value ?? 0), 0);
  const completedCredits = i.weekAssignments
    .filter((a) => a.status === 'complete')
    .reduce((s, a) => s + (a.credits_value ?? 0), 0);
  const collectiveQuotaReached = totalExpected > 0 && completedCredits >= totalExpected;

  const held = new Set(
    [...i.existingKeys].map((k) => ACHIEVEMENT_CATEGORY[k]).filter(Boolean)
  );
  const allCategoriesUnlocked = (['cleaning', 'longevity', 'interaction', 'collective'] as const)
    .every((c) => held.has(c));

  return {
    totalCompleted,
    roomType,
    weeklyCompleted,
    isFirstInCollective,
    kitchenCount: roomTypeCounts['kitchen'] ?? 0,
    roomTypeCount: roomType ? (roomTypeCounts[roomType] ?? 0) : 0,
    allRoomTypesCovered,
    noMissStreak,
    taskStreak,
    isTopScorer,
    topScorerWeeks,
    isCustomTask: i.task?.is_custom ?? false,
    isOwnProposal: false, // task_library records no proposing user
    allMembersCompleted,
    collectiveQuotaReached,
    noDenounceStreak,
    allCategoriesUnlocked,
  };
}
