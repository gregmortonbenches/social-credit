import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3';
import {
  ACHIEVEMENT_CATEGORY,
  keysForEvent,
  taskCompleteFacts,
  type AchievementEventType,
} from '../_shared/achievements.ts';
import { withCors } from '../_shared/cors.ts';
import { weekStartKey } from '../_shared/prosperity.ts';

/**
 * Awards achievements. The app cannot: `achievements` is read-only to it, so a
 * client could otherwise hand itself any badge.
 *
 * The caller sends only WHAT happened — an event type plus ids — never the facts.
 * This function resolves the user from their JWT, checks they are really party to
 * the thing they name (their own completed assignment, a denouncement they are
 * in, a vote they cast, a collective they belong to), reads every fact from the
 * database, and lets the pure rules in _shared/achievements.ts decide. The keys
 * that unlock are returned so the app can show the stamp.
 *
 * draft_complete and holiday_returned are not accepted: nothing raises them yet.
 */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ALLOWED: AchievementEventType[] = [
  'task_complete',
  'denounce_made',
  'denounce_resolved',
  'vote_cast',
  'member_joined',
];

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  let body: { event?: string; collectiveId?: string; assignmentId?: string; denouncementId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Malformed JSON body' }, 400);
  }
  const { event, collectiveId, assignmentId, denouncementId } = body;
  if (!event || !ALLOWED.includes(event as AchievementEventType)) {
    return json({ error: 'Unknown event' }, 400);
  }
  if (!collectiveId) return json({ error: 'collectiveId is required' }, 400);

  try {
    const userId = user.id;

    // Everything below is scoped to a collective the caller is an active member of.
    const { data: membership } = await supabase
      .from('collective_members')
      .select('id')
      .eq('collective_id', collectiveId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership) fail(403, 'Not a member of that Collective');

    const [{ data: collective }, { data: members }, { data: held }] = await Promise.all([
      supabase.from('collectives').select('timezone').eq('id', collectiveId).single(),
      supabase.from('collective_members').select('user_id, joined_at')
        .eq('collective_id', collectiveId).eq('status', 'active'),
      supabase.from('achievements').select('achievement_key').eq('user_id', userId),
    ]);
    const timezone = collective?.timezone ?? 'UTC';
    const activeMembers = members ?? [];
    const existingKeys = new Set((held ?? []).map((a: { achievement_key: string }) => a.achievement_key));

    let facts: Record<string, unknown>;

    switch (event as AchievementEventType) {
      case 'task_complete': {
        if (!assignmentId) fail(400, 'assignmentId is required');
        const { data: assignment } = await supabase
          .from('weekly_assignments')
          .select('id, user_id, collective_id, task_id, week_start, status')
          .eq('id', assignmentId)
          .maybeSingle();
        // Their own, in this collective, and really complete.
        if (!assignment || assignment.user_id !== userId || assignment.collective_id !== collectiveId
            || assignment.status !== 'complete') {
          fail(403, 'Not a completed duty of yours');
        }

        const since = new Date(Date.now() - FOUR_WEEKS_MS).toISOString();
        const [task, mine, week, completedCount, denounced, credits, live] = await Promise.all([
          supabase.from('task_library').select('room_type, is_custom').eq('id', assignment.task_id).maybeSingle(),
          supabase.from('weekly_assignments').select('week_start, status, task_id')
            .eq('user_id', userId).eq('collective_id', collectiveId),
          supabase.from('weekly_assignments').select('user_id, status, credits_value')
            .eq('collective_id', collectiveId).eq('week_start', assignment.week_start),
          supabase.from('weekly_assignments').select('id', { count: 'exact', head: true })
            .eq('collective_id', collectiveId).eq('status', 'complete'),
          supabase.from('denouncements').select('created_at')
            .eq('accused_id', userId).eq('collective_id', collectiveId),
          supabase.from('credit_ledger').select('user_id, delta, created_at')
            .eq('collective_id', collectiveId).like('reason', 'task_complete%')
            .gt('delta', 0).gte('created_at', since),
          supabase.from('task_library').select('room_type')
            .eq('is_custom', true).eq('created_by_collective_id', collectiveId).eq('archived', false),
        ]);

        const userAssignments = mine.data ?? [];
        const taskIds = [...new Set(userAssignments.filter((a: any) => a.status === 'complete').map((a: any) => a.task_id))];
        const { data: details } = taskIds.length
          ? await supabase.from('task_library').select('id, room_type').in('id', taskIds)
          : { data: [] as { id: string; room_type: string }[] };

        facts = taskCompleteFacts({
          userId,
          weekStart: assignment.week_start,
          task: task.data ?? null,
          userAssignments,
          weekAssignments: week.data ?? [],
          collectiveCompletedCount: completedCount.count ?? 0,
          activeMemberIds: activeMembers.map((m: any) => m.user_id),
          denouncementDates: (denounced.data ?? []).map((d: any) => d.created_at),
          recentCredits: credits.data ?? [],
          roomTypeByTaskId: Object.fromEntries((details ?? []).map((t: any) => [t.id, t.room_type])),
          collectiveRooms: [...new Set((live.data ?? []).map((t: any) => t.room_type))],
          existingKeys,
          weekStartOf: (instant) => weekStartKey(toZonedTime(instant, timezone), 0),
        });
        break;
      }

      case 'denounce_made':
      case 'denounce_resolved':
      case 'vote_cast': {
        if (!denouncementId) fail(400, 'denouncementId is required');
        const { data: d } = await supabase
          .from('denouncements')
          .select('id, collective_id, accuser_id, accused_id, outcome, explanation')
          .eq('id', denouncementId)
          .maybeSingle();
        if (!d || d.collective_id !== collectiveId) fail(403, 'No such case in this Collective');

        if (event === 'denounce_made') {
          if (d.accuser_id !== userId) fail(403, 'Not your accusation');
          // Has the accused ever accused this user back?
          const { data: back } = await supabase.from('denouncements').select('id')
            .eq('collective_id', collectiveId).eq('accuser_id', d.accused_id).eq('accused_id', userId);
          facts = { outcome: d.outcome, sameAccusedAsPreviousAccuser: (back ?? []).length > 0 };
        } else if (event === 'denounce_resolved') {
          if (d.accuser_id !== userId && d.accused_id !== userId) fail(403, 'Not your case');
          if (!d.outcome) fail(409, 'Case not resolved');
          const wasAccused = d.accused_id === userId;
          const [votes, total] = await Promise.all([
            supabase.from('denouncement_votes').select('vote').eq('denouncement_id', denouncementId),
            supabase.from('denouncements').select('id', { count: 'exact', head: true })
              .eq('collective_id', collectiveId)
              .or(`accuser_id.eq.${userId},accused_id.eq.${userId}`),
          ]);
          const v = votes.data ?? [];
          facts = {
            outcome: d.outcome,
            wasAccused,
            totalInvolvements: total.count ?? 0,
            allVotedDismiss: v.length > 0 && v.every((x: any) => x.vote === 'dismiss'),
            selfDefenceWon: wasAccused && d.outcome === 'dismissed' && !!d.explanation,
          };
        } else {
          const [mineVote, totalVotes, voters] = await Promise.all([
            supabase.from('denouncement_votes').select('id')
              .eq('denouncement_id', denouncementId).eq('voter_id', userId).maybeSingle(),
            supabase.from('denouncement_votes').select('id', { count: 'exact', head: true }).eq('voter_id', userId),
            supabase.from('denouncement_votes').select('voter_id').eq('denouncement_id', denouncementId),
          ]);
          if (!mineVote.data) fail(403, 'You have not voted on that case');
          const voted = new Set((voters.data ?? []).map((x: any) => x.voter_id));
          facts = {
            totalVotes: totalVotes.count ?? 0,
            allMembersVoted: activeMembers.every((m: any) => voted.has(m.user_id)),
          };
        }
        break;
      }

      case 'member_joined': {
        const mine = activeMembers.find((m: any) => m.user_id === userId);
        const joinedAt = mine?.joined_at ? new Date(mine.joined_at) : new Date();
        const { data: others } = await supabase.from('collective_members').select('collective_id')
          .eq('user_id', userId).neq('collective_id', collectiveId);
        facts = {
          memberCount: activeMembers.length,
          monthsActive: (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24 * 30),
          invitedByUser: false, // no invite tracking in the schema
          isSecondCollective: (others ?? []).length > 0,
        };
        break;
      }
    }

    const unlocked = keysForEvent(event as AchievementEventType, facts)
      .filter((k) => ACHIEVEMENT_CATEGORY[k] && !existingKeys.has(k));

    const newlyUnlocked: string[] = [];
    for (const key of unlocked) {
      // unique (user_id, achievement_key): a concurrent call that got there first
      // just makes this a no-op, and the key is not reported twice.
      const { data: inserted, error } = await supabase
        .from('achievements')
        .upsert({ user_id: userId, achievement_key: key, collective_id: collectiveId },
          { onConflict: 'user_id,achievement_key', ignoreDuplicates: true })
        .select('achievement_key');
      if (error) throw error;
      if (inserted && inserted.length > 0) newlyUnlocked.push(key);
    }

    return json({ unlocked: newlyUnlocked });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status) return json({ error: (err as Error).message }, status);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
}));
