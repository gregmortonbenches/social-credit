import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fromZonedTime, toZonedTime } from 'https://esm.sh/date-fns-tz@3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const AUTO_ASSIGN_HOUR = 14;
const WEEKLY_CREDIT_POOL = 1000;
const DEFAULT_TASK_DUE_HOUR = 23;
const DEFAULT_TASK_DUE_MINUTE = 59;

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    const { data: pendingStates, error } = await supabase
      .from('draft_state')
      .select('*, collectives(timezone)')
      .eq('status', 'pending');

    if (error) throw error;

    const now = new Date();
    const toProcess = force
      ? (pendingStates ?? [])
      : (pendingStates ?? []).filter((ds) => {
          const tz = ds.collectives?.timezone ?? 'UTC';
          const local = toZonedTime(now, tz);
          return local.getDay() === 0 && local.getHours() >= AUTO_ASSIGN_HOUR;
        });

    for (const ds of toProcess) {
      await autoAssign(ds);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: toProcess.length }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

async function autoAssign(ds: {
  id: string;
  collective_id: string;
  week_start: string;
  collectives: { timezone: string } | null;
}) {
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
  if (memberIds.length === 0) return;

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

  const shuffled = [...memberIds].sort(() => Math.random() - 0.5);
  const sortedMembers = shuffled.sort(
    (a, b) => (creditsByUser[b] ?? 0) - (creditsByUser[a] ?? 0)
  );

  const { data: allTasks, error: taskErr } = await supabase
    .from('task_library')
    .select('id, name')
    .or(`is_custom.eq.false,created_by_collective_id.eq.${collectiveId}`);
  if (taskErr) throw new Error(`task_library: ${taskErr.message}`);

  const taskPool = (allTasks ?? []).map((t: { id: string; name: string }) => t.id);
  if (taskPool.length === 0) return;

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

  if (assignments.length === 0) return;

  const creditsValue = Math.floor(WEEKLY_CREDIT_POOL / assignments.length);
  const dueDate = getUpcomingSundayDue(timezone, weekStart);

  const insertRows = assignments.map((a) => ({
    collective_id: collectiveId,
    user_id: a.user_id,
    task_id: a.task_id,
    week_start: weekStart,
    due_date: dueDate,
    credits_value: creditsValue,
    status: 'pending',
  }));

  const { error: insertErr } = await supabase.from('weekly_assignments').insert(insertRows);
  if (insertErr) throw new Error(`weekly_assignments insert: ${insertErr.message}`);
  await supabase.from('draft_state').update({ status: 'complete' }).eq('id', ds.id);

  for (const userId of memberIds) {
    await notifyUser(userId, {
      title: 'Tasks Assigned!',
      body: "The Collective's weekly tasks have been assigned, Comrade. Check your duties.",
    });
  }
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

function getUpcomingSundayDue(collectiveTimezone: string, weekStart: string): string {
  const monday = new Date(weekStart);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const localStr = `${sunday.toISOString().split('T')[0]}T${String(DEFAULT_TASK_DUE_HOUR).padStart(2, '0')}:${String(DEFAULT_TASK_DUE_MINUTE).padStart(2, '0')}:00`;
  return fromZonedTime(new Date(localStr), collectiveTimezone).toISOString();
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
