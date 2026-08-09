import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rejectNonCronCaller } from '../_shared/cron-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const DRAFT_TURN_TIMEOUT_MINUTES = 60;
const WEEKLY_CREDIT_POOL = 1000;

Deno.serve(async (req) => {
  const denied = rejectNonCronCaller(req);
  if (denied) return denied;

  try {
    const now = new Date().toISOString();

    // Find active drafts with expired turns
    const { data: expiredDrafts, error } = await supabase
      .from('draft_state')
      .select('*, collectives(timezone)')
      .eq('status', 'active')
      .lt('turn_deadline', now);

    if (error) throw error;

    for (const draft of expiredDrafts ?? []) {
      await handleExpiredTurn(draft);
    }

    return new Response(JSON.stringify({ ok: true, processed: (expiredDrafts ?? []).length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

async function handleExpiredTurn(draft: any) {
  const order = draft.draft_order as string[];
  const currentPicker = order[draft.current_turn_index];

  // Get unassigned tasks for this collective/week
  const { data: allTasks } = await supabase
    .from('task_library')
    .select('id')
    .or(`is_custom.eq.false,created_by_collective_id.eq.${draft.collective_id}`);

  const { data: assigned } = await supabase
    .from('weekly_assignments')
    .select('task_id')
    .eq('collective_id', draft.collective_id)
    .eq('week_start', draft.week_start);

  const assignedIds = new Set((assigned ?? []).map((a: any) => a.task_id));
  const unassigned = (allTasks ?? []).filter((t: any) => !assignedIds.has(t.id));

  if (unassigned.length === 0) {
    await closeDraft(draft);
    return;
  }

  // Pick a random task
  const randomTask = unassigned[Math.floor(Math.random() * unassigned.length)];
  const dueDate = getUpcomingSunday(draft.collective_id);

  await supabase.from('weekly_assignments').insert({
    collective_id: draft.collective_id,
    user_id: currentPicker,
    task_id: randomTask.id,
    week_start: draft.week_start,
    due_date: dueDate,
    status: 'pending',
  });

  const nextIndex = draft.current_turn_index + 1;
  const isComplete = nextIndex >= order.length || unassigned.length <= 1;

  if (isComplete) {
    await closeDraft(draft);
  } else {
    const nextPicker = order[nextIndex];
    const newDeadline = new Date(Date.now() + DRAFT_TURN_TIMEOUT_MINUTES * 60000).toISOString();

    await supabase.from('draft_state').update({
      current_turn_index: nextIndex,
      turn_deadline: newDeadline,
    }).eq('id', draft.id);

    // Notify next picker
    await notifyUser(nextPicker, {
      title: "It's your turn!",
      body: "It's your turn in the Weekly Draft, Comrade! You have 1 hour.",
    });
    await notifyUser(currentPicker, {
      title: 'Draft turn passed',
      body: 'Your draft turn passed — a task has been assigned for you.',
    });
  }
}

async function closeDraft(draft: any) {
  await supabase.from('draft_state').update({ status: 'complete', turn_deadline: null }).eq('id', draft.id);

  // Calculate credit values
  const { data: assignments } = await supabase
    .from('weekly_assignments')
    .select('id')
    .eq('collective_id', draft.collective_id)
    .eq('week_start', draft.week_start);

  if (!assignments?.length) return;
  const creditsValue = Math.floor(WEEKLY_CREDIT_POOL / assignments.length);

  await supabase
    .from('weekly_assignments')
    .update({ credits_value: creditsValue })
    .eq('collective_id', draft.collective_id)
    .eq('week_start', draft.week_start);
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
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ token: profile.device_push_token, ...notification }),
  });
}

function getUpcomingSunday(_collectiveId: string): string {
  const d = new Date();
  const daysUntilSunday = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}
