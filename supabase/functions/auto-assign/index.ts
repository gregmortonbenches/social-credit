import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fromZonedTime, toZonedTime } from 'https://esm.sh/date-fns-tz@3';
import { weekStartKey } from '../_shared/prosperity.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const AUTO_ASSIGN_HOUR = 14;
const WEEKLY_CREDIT_POOL = 1000;
const DEFAULT_TASK_DUE_HOUR = 23;
const DEFAULT_TASK_DUE_MINUTE = 59;
// Offset from week_start (a Monday) of the backstop day. 6 = Sunday.
const BACKSTOP_DAY_OFFSET = 6;
const STAGGER_TASK_DUE_DATES = true;

type DraftState = {
  id: string;
  collective_id: string;
  week_start: string;
  collectives: { timezone: string } | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return JSON.stringify(err);
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));

  try {
    // Two kinds of caller. The cron holds the service role key and sweeps every
    // pending Collective. Anyone else is turned away, with one exception: an
    // admin may force a single Collective they belong to (the dev button in
    // Settings), because the app can never hold the service role key.
    let toProcess: DraftState[];
    if (req.headers.get('Authorization') === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
      toProcess = await dueDraftStates();
    } else {
      const forced = await forceForAdmin(req, body);
      if (forced instanceof Response) return forced;
      toProcess = forced;
    }

    // One Collective failing must not strand the rest of the sweep.
    const failures: string[] = [];
    let processed = 0;
    for (const ds of toProcess) {
      try {
        await autoAssign(ds);
        processed++;
      } catch (err) {
        failures.push(`${ds.collective_id}: ${errorMessage(err)}`);
      }
    }

    if (failures.length > 0 && processed === 0) {
      return json({ error: failures.join('; ') }, 500);
    }
    return json({ ok: true, processed, failures });
  } catch (err) {
    return json({ error: errorMessage(err) }, 500);
  }
});

/** Pending Collectives whose local time is Sunday, at or past the assignment hour. */
async function dueDraftStates(): Promise<DraftState[]> {
  const { data, error } = await supabase
    .from('draft_state')
    .select('id, collective_id, week_start, collectives(timezone)')
    .eq('status', 'pending');
  if (error) throw error;

  const now = new Date();
  return ((data ?? []) as unknown as DraftState[]).filter((ds) => {
    const local = toZonedTime(now, ds.collectives?.timezone ?? 'UTC');
    return local.getDay() === 0 && local.getHours() >= AUTO_ASSIGN_HOUR;
  });
}

/**
 * Dev force-assign for an admin. Resolves the caller from their JWT, requires
 * `profiles.is_admin` (server-owned since migration 020: nobody can grant it to
 * themselves) and membership of the Collective, then clears this week's
 * still-pending assignments and re-opens the draft so the normal path can run.
 */
async function forceForAdmin(req: Request, body: any): Promise<DraftState[] | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) return new Response('Forbidden', { status: 403 });

  const collectiveId = body?.collectiveId;
  if (body?.force !== true || typeof collectiveId !== 'string') {
    return json({ error: 'force: true and collectiveId are required' }, 400);
  }

  const { data: membership } = await supabase
    .from('collective_members')
    .select('id')
    .eq('collective_id', collectiveId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return new Response('Forbidden', { status: 403 });

  const { data: collective, error: collectiveError } = await supabase
    .from('collectives')
    .select('timezone')
    .eq('id', collectiveId)
    .single();
  if (collectiveError) throw collectiveError;

  const weekStart = weekStartKey(toZonedTime(new Date(), collective.timezone), 0);

  const { error: clearError } = await supabase
    .from('weekly_assignments')
    .delete()
    .eq('collective_id', collectiveId)
    .eq('week_start', weekStart)
    .eq('status', 'pending');
  if (clearError) throw clearError;

  const { data: draft, error: draftError } = await supabase
    .from('draft_state')
    .upsert(
      { collective_id: collectiveId, week_start: weekStart, status: 'pending' },
      { onConflict: 'collective_id,week_start' }
    )
    .select('id, collective_id, week_start, collectives(timezone)')
    .single();
  if (draftError) throw draftError;

  return [draft as unknown as DraftState];
}

/**
 * Claim the week, assign it, and give the claim back if nothing was assigned.
 *
 * The claim is a conditional UPDATE (pending -> complete), so two overlapping
 * invocations cannot both win it. Previously the rows were inserted first and
 * the draft marked complete afterwards, unchecked: if that second step failed,
 * or two ticks overlapped, the next tick inserted the whole week again.
 */
async function autoAssign(ds: DraftState) {
  const { data: claimed, error: claimError } = await supabase
    .from('draft_state')
    .update({ status: 'complete' })
    .eq('id', ds.id)
    .eq('status', 'pending')
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return; // someone else has it

  let assignedTo: string[] = [];
  try {
    assignedTo = await assignWeek(ds);
  } catch (err) {
    await release(ds.id);
    throw err;
  }
  if (assignedTo.length === 0) {
    await release(ds.id); // nothing to assign yet (no members or tasks): try again next tick
    return;
  }

  // The week is assigned and committed. A failed push must not undo that or stop
  // the others being told.
  for (const userId of assignedTo) {
    try {
      await notifyUser(userId, {
        title: 'Tasks Assigned!',
        body: "The Collective's weekly tasks have been assigned, Comrade. Check your duties.",
      });
    } catch (err) {
      console.warn(`push to ${userId} failed:`, errorMessage(err));
    }
  }
}

async function release(draftId: string) {
  const { error } = await supabase.from('draft_state').update({ status: 'pending' }).eq('id', draftId);
  if (error) console.warn(`could not release draft ${draftId}:`, errorMessage(error));
}

/** Builds and inserts the week's assignments. Returns the members to notify, or [] if none were made. */
async function assignWeek(ds: DraftState): Promise<string[]> {
  const collectiveId = ds.collective_id;
  const weekStart = ds.week_start;
  const timezone = ds.collectives?.timezone ?? 'UTC';

  const { data: memberRows, error: memberErr } = await supabase
    .from('collective_members')
    .select('user_id')
    .eq('collective_id', collectiveId)
    .eq('status', 'active');
  if (memberErr) throw new Error(`collective_members: ${memberErr.message}`);

  const memberIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);
  if (memberIds.length === 0) return [];

  const prevWeekStart = getPrevWeekStart(weekStart);
  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from('credit_ledger')
    .select('user_id, delta')
    .eq('collective_id', collectiveId)
    .gte('created_at', prevWeekStart)
    .lt('created_at', weekStart)
    .like('reason', 'task_complete%')
    .gt('delta', 0);
  if (ledgerErr) throw new Error(`credit_ledger: ${ledgerErr.message}`);

  const creditsByUser: Record<string, number> = {};
  for (const row of ledgerRows ?? []) {
    creditsByUser[row.user_id] = (creditsByUser[row.user_id] ?? 0) + row.delta;
  }

  const sortedMembers = shuffle(memberIds).sort(
    (a, b) => (creditsByUser[b] ?? 0) - (creditsByUser[a] ?? 0)
  );

  const { data: allTasks, error: taskErr } = await supabase
    .from('task_library')
    .select('id, name')
    .or(`is_custom.eq.false,created_by_collective_id.eq.${collectiveId}`);
  if (taskErr) throw new Error(`task_library: ${taskErr.message}`);

  // Tasks already handed out this week (a forced re-run keeps completed ones)
  // stay with whoever has them.
  const { data: existing, error: existingErr } = await supabase
    .from('weekly_assignments')
    .select('task_id')
    .eq('collective_id', collectiveId)
    .eq('week_start', weekStart)
    .neq('status', 'reassigned');
  if (existingErr) throw new Error(`weekly_assignments: ${existingErr.message}`);
  const taken = new Set((existing ?? []).map((a: { task_id: string }) => a.task_id));

  const taskPool = (allTasks ?? [])
    .map((t: { id: string; name: string }) => t.id)
    .filter((id: string) => !taken.has(id));
  if (taskPool.length === 0) return [];

  const { data: prefRows, error: prefErr } = await supabase
    .from('task_preferences')
    .select('user_id, task_id, rank')
    .eq('collective_id', collectiveId)
    .in('user_id', memberIds)
    .order('rank', { ascending: true });
  if (prefErr) throw new Error(`task_preferences: ${prefErr.message}`);

  const prefMap: Record<string, string[]> = {};
  for (const row of prefRows ?? []) {
    if (!prefMap[row.user_id]) prefMap[row.user_id] = [];
    prefMap[row.user_id].push(row.task_id);
  }

  const assignments: Array<{ user_id: string; task_id: string }> = [];
  const remaining = new Set(taskPool);
  const memberTaskCount: Record<string, number> = Object.fromEntries(
    memberIds.map((id) => [id, 0])
  );

  while (remaining.size > 0) {
    let anyAssigned = false;
    for (const userId of sortedMembers) {
      if (remaining.size === 0) break;
      const taskId = pickPreferred(userId, prefMap, remaining) ?? pickAny(remaining);
      if (!taskId) break;
      assignments.push({ user_id: userId, task_id: taskId });
      remaining.delete(taskId);
      memberTaskCount[userId]++;
      anyAssigned = true;
    }
    if (!anyAssigned) break;
  }

  if (assignments.length === 0) return [];

  const creditsValue = Math.floor(WEEKLY_CREDIT_POOL / assignments.length);

  // Spread each member's deadlines across the week rather than dropping every
  // task on Sunday 23:59. With a single shared deadline, the Tasks panel's
  // "TODAY'S DUTIES" section was empty six days in seven and then held the whole
  // week at once, and a task was only ever `overdue` in the sliver between
  // Sunday 23:59 and weekly-reset — which is the window denouncing depends on.
  const perUserTotal: Record<string, number> = {};
  for (const a of assignments) perUserTotal[a.user_id] = (perUserTotal[a.user_id] ?? 0) + 1;
  const perUserSeen: Record<string, number> = {};

  const insertRows = assignments.map((a) => {
    const indexForUser = perUserSeen[a.user_id] ?? 0;
    perUserSeen[a.user_id] = indexForUser + 1;
    return {
      collective_id: collectiveId,
      user_id: a.user_id,
      task_id: a.task_id,
      week_start: weekStart,
      due_date: getStaggeredDue(timezone, weekStart, indexForUser, perUserTotal[a.user_id]),
      credits_value: creditsValue,
      status: 'pending',
    };
  });

  const { error: insertErr } = await supabase.from('weekly_assignments').insert(insertRows);
  if (insertErr) throw new Error(`weekly_assignments insert: ${insertErr.message}`);

  return memberIds;
}

/** Fisher-Yates. `sort(() => Math.random() - 0.5)` is biased and engine-dependent. */
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPreferred(
  userId: string,
  prefMap: Record<string, string[]>,
  remaining: Set<string>
): string | null {
  for (const taskId of prefMap[userId] ?? []) {
    if (remaining.has(taskId)) return taskId;
  }
  return null;
}

function pickAny(remaining: Set<string>): string | null {
  const iter = remaining.values().next();
  return iter.done ? null : iter.value;
}

function getPrevWeekStart(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

/** Calendar arithmetic on a yyyy-MM-dd string, with no timezone involved. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

/**
 * The deadline for one of a member's tasks, at DEFAULT_TASK_DUE_HOUR:MINUTE in
 * the collective's timezone.
 *
 * A member holding `total` tasks gets them spread over the week, with the last
 * always landing on the backstop day (Sunday) so nothing extends past the weekly
 * reset. One task keeps the whole week, as before. Tasks are handed out in
 * preference order, so a member's top pick gets the earliest deadline:
 *
 *   1 task  -> Sun
 *   2 tasks -> Mon, Sun
 *   3 tasks -> Mon, Thu, Sun
 *   7 tasks -> one per day, Mon..Sun
 *
 * The string is handed to fromZonedTime directly rather than via `new Date()`,
 * which would parse it against the *server's* timezone before conversion.
 */
function getStaggeredDue(
  collectiveTimezone: string,
  weekStart: string,
  indexForUser: number,
  total: number
): string {
  // Spread evenly across the whole week, endpoints included, so the first task
  // lands on Monday and the last on the backstop. Dividing by `total` instead of
  // `total - 1` pushed everything later, which left Monday unused and produced
  // duplicate days once a member held five or more tasks.
  const offset =
    STAGGER_TASK_DUE_DATES && total > 1
      ? Math.round((BACKSTOP_DAY_OFFSET * indexForUser) / (total - 1))
      : BACKSTOP_DAY_OFFSET;

  const day = addDays(weekStart, offset);
  const hh = String(DEFAULT_TASK_DUE_HOUR).padStart(2, '0');
  const mm = String(DEFAULT_TASK_DUE_MINUTE).padStart(2, '0');
  return fromZonedTime(`${day}T${hh}:${mm}:00`, collectiveTimezone).toISOString();
}

async function notifyUser(userId: string, notification: { title: string; body: string }) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('device_push_token')
    .eq('id', userId)
    .single();

  if (!profile?.device_push_token) return;

  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ token: profile.device_push_token, ...notification }),
  });
}
