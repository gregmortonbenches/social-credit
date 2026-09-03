import { ACHIEVEMENTS, ACHIEVEMENTS_BY_KEY } from '../constants/achievements';
import type { AchievementCategory } from '../constants/achievements';
import { collectiveWeekStart } from './draft';
import { supabase } from './supabase';
import type { WeeklyAssignment } from './database.types';

export interface AchievementEvent {
  type:
    | 'task_complete'
    | 'denounce_made'
    | 'denounce_resolved'
    | 'vote_cast'
    | 'draft_complete'
    | 'member_joined'
    | 'holiday_returned';
  payload: Record<string, any>;
}

export async function checkAchievements(
  userId: string,
  collectiveId: string,
  event: AchievementEvent
): Promise<string[]> {
  const { data: existing } = await supabase
    .from('achievements')
    .select('achievement_key')
    .eq('user_id', userId);
  const unlocked = new Set((existing ?? []).map((a) => a.achievement_key));

  const newlyUnlocked: string[] = [];

  async function unlock(key: string) {
    if (unlocked.has(key) || !ACHIEVEMENTS_BY_KEY[key]) return;
    const { error } = await supabase
      .from('achievements')
      .insert({ user_id: userId, achievement_key: key, collective_id: collectiveId });
    if (!error) {
      unlocked.add(key);
      newlyUnlocked.push(key);
    }
  }

  switch (event.type) {
    case 'task_complete': {
      const { totalCompleted, roomType, weeklyCompleted, isFirstInCollective } = event.payload;

      if (totalCompleted >= 1) await unlock('class_struggle');
      if (totalCompleted >= 10) await unlock('ten_great_constructions');
      if (weeklyCompleted >= 3) await unlock('struggle_sessions');
      if (isFirstInCollective) await unlock('young_pioneers');

      if (roomType === 'kitchen' && (event.payload.kitchenCount ?? 0) >= 10) {
        await unlock('backyard_furnace');
      }
      if ((event.payload.roomTypeCount ?? 0) >= 5) await unlock('eastward_expansion');
      if (event.payload.allRoomTypesCovered) await unlock('westward_expansion');
      if ((event.payload.noMissStreak ?? 0) >= 4) await unlock('iron_rice_bowl');
      if ((event.payload.noMissStreak ?? 0) >= 8) await unlock('continuous_revolution');
      if ((event.payload.taskStreak ?? 0) >= 6) await unlock('long_march');
      if ((event.payload.taskStreak ?? 0) >= 5) await unlock('five_year_plan');
      if (event.payload.isTopScorer) await unlock('hero_of_the_people');
      if (event.payload.topScorerWeeks >= 3) await unlock('party_leadership');
      if (event.payload.isCustomTask) await unlock('hundred_flowers');
      if (event.payload.isOwnProposal) await unlock('self_reliance');
      if (event.payload.allMembersCompleted) await unlock('household_responsibility');
      if (event.payload.collectiveQuotaReached) await unlock('collectivisation');
      if ((event.payload.noDenounceStreak ?? 0) >= 3) await unlock('three_anti_campaign');
      if (event.payload.allCategoriesUnlocked) await unlock('four_modernisations');
      break;
    }

    case 'denounce_made': {
      const { outcome, sameAccusedAsPreviousAccuser } = event.payload;
      if (outcome === 'upheld') await unlock('purge_the_bourgeoisie');
      if (sameAccusedAsPreviousAccuser) await unlock('double_agents');
      break;
    }

    case 'denounce_resolved': {
      const { outcome, wasAccused, totalInvolvements, allVotedDismiss, selfDefenceWon } = event.payload;
      if (wasAccused) await unlock('know_the_enemy');
      if (outcome === 'dismissed' && selfDefenceWon) await unlock('reeducation_through_labour');
      if (outcome === 'dismissed' && selfDefenceWon) await unlock('workers_faculties');
      if (allVotedDismiss) await unlock('patriotic_war');
      if (totalInvolvements >= 5) await unlock('cultural_revolution');
      break;
    }

    case 'vote_cast': {
      const { totalVotes } = event.payload;
      if (totalVotes >= 1) await unlock('united_front');
      if (event.payload.allMembersVoted) await unlock('mass_line');
      break;
    }

    case 'draft_complete': {
      const { totalDrafts } = event.payload;
      if (totalDrafts >= 3) await unlock('production_team');
      if (totalDrafts >= 10) await unlock('production_brigade');
      if (event.payload.firstPicker) await unlock('planned_economy');
      break;
    }

    case 'member_joined': {
      const { memberCount, monthsActive, invitedByUser } = event.payload;
      if (memberCount >= 4) await unlock('gang_of_four');
      if ((monthsActive ?? 0) >= 1) await unlock('peoples_communes');
      if (invitedByUser) await unlock('rally_the_peasants');
      if (invitedByUser) await unlock('propaganda');
      if (event.payload.isSecondCollective) await unlock('sino_soviet_split');
      break;
    }

    case 'holiday_returned': {
      if (event.payload.completedAllAfterReturn) await unlock('land_reform');
      break;
    }
  }

  return newlyUnlocked;
}

export async function buildDenounceMadePayload(
  accuserId: string,
  collectiveId: string,
  accusedId: string,
  outcome: 'upheld' | 'dismissed' | null
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('denouncements')
    .select('id')
    .eq('collective_id', collectiveId)
    .eq('accuser_id', accusedId)
    .eq('accused_id', accuserId);

  return {
    outcome,
    sameAccusedAsPreviousAccuser: (data ?? []).length > 0,
  };
}

export async function buildDenounceResolvedPayload(
  userId: string,
  collectiveId: string,
  denouncementId: string,
  denouncement: { accuser_id: string; accused_id: string; outcome: string | null; explanation: string | null }
): Promise<Record<string, unknown>> {
  const wasAccused = denouncement.accused_id === userId;
  const outcome = denouncement.outcome;
  const selfDefenceWon = wasAccused && outcome === 'dismissed' && !!denouncement.explanation;

  const [votesResult, totalResult] = await Promise.all([
    supabase.from('denouncement_votes').select('vote').eq('denouncement_id', denouncementId),
    supabase
      .from('denouncements')
      .select('id', { count: 'exact', head: true })
      .eq('collective_id', collectiveId)
      .or(`accuser_id.eq.${userId},accused_id.eq.${userId}`),
  ]);

  const votes = votesResult.data ?? [];
  const allVotedDismiss = votes.length > 0 && votes.every((v) => v.vote === 'dismiss');
  const totalInvolvements = totalResult.count ?? 0;

  return { outcome, wasAccused, totalInvolvements, allVotedDismiss, selfDefenceWon };
}

export async function buildVoteCastPayload(
  userId: string,
  collectiveId: string,
  denouncementId: string
): Promise<Record<string, unknown>> {
  const [totalResult, votersResult, membersResult] = await Promise.all([
    supabase
      .from('denouncement_votes')
      .select('id', { count: 'exact', head: true })
      .eq('voter_id', userId),
    supabase.from('denouncement_votes').select('voter_id').eq('denouncement_id', denouncementId),
    supabase
      .from('collective_members')
      .select('user_id')
      .eq('collective_id', collectiveId)
      .eq('status', 'active'),
  ]);

  const voterIds = new Set((votersResult.data ?? []).map((v) => v.voter_id));
  const activeMembers = membersResult.data ?? [];
  const allMembersVoted = activeMembers.every((m) => voterIds.has(m.user_id));

  return { totalVotes: totalResult.count ?? 0, allMembersVoted };
}

export async function buildMemberJoinedPayload(
  userId: string,
  collectiveId: string
): Promise<Record<string, unknown>> {
  const [membersResult, historyResult] = await Promise.all([
    supabase
      .from('collective_members')
      .select('user_id, joined_at')
      .eq('collective_id', collectiveId)
      .eq('status', 'active'),
    supabase
      .from('collective_members')
      .select('collective_id')
      .eq('user_id', userId)
      .neq('collective_id', collectiveId),
  ]);

  const activeMembers = membersResult.data ?? [];
  const myMembership = activeMembers.find((m) => m.user_id === userId);
  const joinedAt = myMembership?.joined_at ? new Date(myMembership.joined_at) : new Date();
  const monthsActive = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);

  return {
    memberCount: activeMembers.length,
    monthsActive,
    invitedByUser: false, // no invite tracking in schema
    isSecondCollective: (historyResult.data ?? []).length > 0,
  };
}

export async function buildTaskCompletePayload(
  userId: string,
  collectiveId: string,
  assignment: WeeklyAssignment
): Promise<Record<string, unknown>> {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const [
    taskResult,
    userAssignmentsResult,
    weekAssignmentsResult,
    collectiveCompletedCountResult,
    collectiveResult,
    activeMembersResult,
    denouncementsResult,
    recentCreditsResult,
    existingAchievementsResult,
  ] = await Promise.all([
    supabase.from('task_library').select('room_type, is_custom').eq('id', assignment.task_id).single(),
    supabase.from('weekly_assignments').select('week_start, status, task_id').eq('user_id', userId).eq('collective_id', collectiveId),
    supabase.from('weekly_assignments').select('user_id, status, credits_value').eq('collective_id', collectiveId).eq('week_start', assignment.week_start),
    supabase.from('weekly_assignments').select('id', { count: 'exact', head: true }).eq('collective_id', collectiveId).eq('status', 'complete'),
    supabase.from('collectives').select('rooms, timezone').eq('id', collectiveId).single(),
    supabase.from('collective_members').select('user_id').eq('collective_id', collectiveId).eq('status', 'active'),
    supabase.from('denouncements').select('created_at').eq('accused_id', userId).eq('collective_id', collectiveId),
    supabase.from('credit_ledger').select('user_id, delta, created_at').eq('collective_id', collectiveId).like('reason', 'task_complete%').gt('delta', 0).gte('created_at', fourWeeksAgo.toISOString()),
    supabase.from('achievements').select('achievement_key').eq('user_id', userId),
  ]);

  const task = taskResult.data;
  const userAssignments = userAssignmentsResult.data ?? [];
  const weekAssignments = weekAssignmentsResult.data ?? [];
  const collectiveTotalCompleted = collectiveCompletedCountResult.count ?? 0;
  const collectiveRooms = Array.isArray(collectiveResult.data?.rooms)
    ? (collectiveResult.data!.rooms as string[])
    : [];
  // Week keys below are compared against `weekly_assignments.week_start`, which
  // the Edge Functions write as a Monday in the COLLECTIVE's timezone. Deriving
  // them from the device clock produced keys that simply never matched: the old
  // helper ran a device-local date through toISOString(), so for any household
  // behind UTC an evening timestamp yielded the *next* day — never a Monday.
  // A key that matches nothing silently zeroes the streak and top-scorer maths.
  const timezone =
    collectiveResult.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const activeMembers = activeMembersResult.data ?? [];
  const denouncements = denouncementsResult.data ?? [];
  const recentCredits = recentCreditsResult.data ?? [];
  const existingAchievements = new Set(
    (existingAchievementsResult.data ?? []).map((a) => a.achievement_key)
  );

  const roomType = task?.room_type ?? null;
  const isCustomTask = task?.is_custom ?? false;

  const userCompleted = userAssignments.filter((a) => a.status === 'complete');
  const totalCompleted = userCompleted.length;

  const myWeeklyAssignments = weekAssignments.filter((a) => a.user_id === userId);
  const weeklyCompleted = myWeeklyAssignments.filter((a) => a.status === 'complete').length;

  const isFirstInCollective = collectiveTotalCompleted === 1;

  // Room type data for all of this user's completed tasks
  const uniqueTaskIds = [...new Set(userCompleted.map((a) => a.task_id))];
  const { data: taskDetails } = uniqueTaskIds.length > 0
    ? await supabase.from('task_library').select('id, room_type').in('id', uniqueTaskIds)
    : { data: [] as { id: string; room_type: string }[] };

  const taskRoomMap: Record<string, string> = Object.fromEntries(
    (taskDetails ?? []).map((t) => [t.id, t.room_type])
  );

  const roomTypeCounts: Record<string, number> = {};
  for (const a of userCompleted) {
    const rt = taskRoomMap[a.task_id];
    if (rt) roomTypeCounts[rt] = (roomTypeCounts[rt] ?? 0) + 1;
  }
  const kitchenCount = roomTypeCounts['kitchen'] ?? 0;
  const roomTypeCount = roomType ? (roomTypeCounts[roomType] ?? 0) : 0;
  const coveredRoomTypes = new Set(Object.keys(roomTypeCounts));
  const allRoomTypesCovered =
    collectiveRooms.length > 0 && collectiveRooms.every((rt) => coveredRoomTypes.has(rt));

  // Streak calculations — group assignments by week
  const weekMap: Record<string, { hasComplete: boolean; hasFailed: boolean }> = {};
  for (const a of userAssignments) {
    if (!weekMap[a.week_start]) weekMap[a.week_start] = { hasComplete: false, hasFailed: false };
    if (a.status === 'complete') weekMap[a.week_start].hasComplete = true;
    if (a.status === 'failed') weekMap[a.week_start].hasFailed = true;
  }
  const weekStarts = Object.keys(weekMap).sort().reverse();

  let taskStreak = 0;
  for (const ws of weekStarts) {
    if (weekMap[ws].hasComplete) taskStreak++;
    else break;
  }

  let noMissStreak = 0;
  for (const ws of weekStarts) {
    if (!weekMap[ws].hasFailed) noMissStreak++;
    else break;
  }

  const denouncedWeeks = new Set(
    denouncements.map((d) => collectiveWeekStart(timezone, new Date(d.created_at)))
  );
  let noDenounceStreak = 0;
  for (const ws of weekStarts) {
    if (!denouncedWeeks.has(ws)) noDenounceStreak++;
    else break;
  }

  // Top scorer — based on credit_ledger (reflects completed weeks; current week
  // credits may not be present yet if award and check race)
  const weeklyCredits: Record<string, Record<string, number>> = {};
  for (const row of recentCredits) {
    const ws = collectiveWeekStart(timezone, new Date(row.created_at));
    if (!weeklyCredits[ws]) weeklyCredits[ws] = {};
    weeklyCredits[ws][row.user_id] = (weeklyCredits[ws][row.user_id] ?? 0) + row.delta;
  }
  const recentWeeks = Object.keys(weeklyCredits).sort().reverse();
  const currentWeekCredits = weeklyCredits[assignment.week_start] ?? {};
  const myCurrentCredits = currentWeekCredits[userId] ?? 0;
  const isTopScorer =
    activeMembers.length > 0 &&
    activeMembers.every(
      (m) => m.user_id === userId || (currentWeekCredits[m.user_id] ?? 0) <= myCurrentCredits
    );

  let topScorerWeeks = 0;
  for (const ws of recentWeeks) {
    const wc = weeklyCredits[ws] ?? {};
    const mine = wc[userId] ?? 0;
    if (mine > 0 && activeMembers.every((m) => m.user_id === userId || (wc[m.user_id] ?? 0) <= mine))
      topScorerWeeks++;
    else break;
  }

  // All active members completed all their tasks this week
  const activeMemberIds = new Set(activeMembers.map((m) => m.user_id));
  const allMembersCompleted = [...activeMemberIds].every((memberId) => {
    const memberTasks = weekAssignments.filter((a) => a.user_id === memberId);
    return memberTasks.length > 0 && memberTasks.every((a) => a.status === 'complete');
  });

  // Collective quota: all task credits earned this week
  const totalExpected = weekAssignments.reduce((sum, a) => sum + (a.credits_value ?? 0), 0);
  const completedCredits = weekAssignments
    .filter((a) => a.status === 'complete')
    .reduce((sum, a) => sum + (a.credits_value ?? 0), 0);
  const collectiveQuotaReached = totalExpected > 0 && completedCredits >= totalExpected;

  // All achievement categories unlocked
  const allCategories: AchievementCategory[] = ['cleaning', 'longevity', 'interaction', 'collective'];
  const unlockedCategories = new Set(
    ACHIEVEMENTS.filter((a) => existingAchievements.has(a.key)).map((a) => a.category)
  );
  const allCategoriesUnlocked = allCategories.every((c) => unlockedCategories.has(c));

  return {
    totalCompleted,
    roomType,
    weeklyCompleted,
    isFirstInCollective,
    kitchenCount,
    roomTypeCount,
    allRoomTypesCovered,
    noMissStreak,
    taskStreak,
    isTopScorer,
    topScorerWeeks,
    isCustomTask,
    isOwnProposal: false, // task_library has no created_by_user_id — always false for now
    allMembersCompleted,
    collectiveQuotaReached,
    noDenounceStreak,
    allCategoriesUnlocked,
  };
}
