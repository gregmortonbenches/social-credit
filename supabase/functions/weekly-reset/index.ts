import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3';
import { rejectNonCronCaller } from '../_shared/cron-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const denied = rejectNonCronCaller(req);
  if (denied) return denied;

  const utcNow = new Date();

  const { data: collectives, error } = await supabase
    .from('collectives')
    .select('id, timezone');

  if (error) return new Response(JSON.stringify({ error: String(error) }), { status: 500 });

  const results: string[] = [];

  for (const collective of collectives ?? []) {
    try {
      const localNow = toZonedTime(utcNow, collective.timezone);
      const dayOfWeek = localNow.getDay();
      const hour = localNow.getHours();

      if (dayOfWeek === 1 && hour === 0) {
        await runWeeklyReset(collective.id);
        results.push(`Reset ${collective.id}`);
      }
    } catch (err) {
      results.push(`Error ${collective.id}: ${String(err)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function runWeeklyReset(collectiveId: string) {
  const now = new Date().toISOString();
  const weekStart = getPrevMonday();

  // Fail any incomplete assignments from the previous week
  const { data: failedAssignments } = await supabase
    .from('weekly_assignments')
    .select('id, user_id, credits_value')
    .eq('collective_id', collectiveId)
    .eq('week_start', weekStart)
    .eq('status', 'pending')
    .lt('due_date', now);

  for (const assignment of failedAssignments ?? []) {
    await supabase
      .from('weekly_assignments')
      .update({ status: 'failed' })
      .eq('id', assignment.id);

    if (assignment.credits_value) {
      await supabase.rpc('credits_transaction', {
        p_user_id: assignment.user_id,
        p_collective_id: collectiveId,
        p_delta: -assignment.credits_value,
        p_reason: 'task_failed',
        p_reference_id: assignment.id,
      });
    }
  }

  // Award credits for completed assignments not yet settled
  const { data: completedAssignments } = await supabase
    .from('weekly_assignments')
    .select('id, user_id, credits_value')
    .eq('collective_id', collectiveId)
    .eq('week_start', weekStart)
    .eq('status', 'complete');

  for (const assignment of completedAssignments ?? []) {
    const { data: alreadyAwarded } = await supabase
      .from('credit_ledger')
      .select('id')
      .eq('reference_id', assignment.id)
      .eq('reason', 'task_complete')
      .maybeSingle();

    if (!alreadyAwarded && assignment.credits_value) {
      await supabase.rpc('credits_transaction', {
        p_user_id: assignment.user_id,
        p_collective_id: collectiveId,
        p_delta: assignment.credits_value,
        p_reason: 'task_complete',
        p_reference_id: assignment.id,
      });
    }
  }

  // Promote anyone who joined mid-week. join_collective_by_code() enrols a
  // joiner as 'pending' unless they joined on a Monday in the collective's
  // timezone (migration 013), and Monday 00:00 local is exactly now — so this is
  // where they become active. Without this step a mid-week joiner stays pending
  // indefinitely: they can see the collective but auto-assign skips them, so
  // they never receive a task.
  await supabase
    .from('collective_members')
    .update({ status: 'active' })
    .eq('collective_id', collectiveId)
    .eq('status', 'pending');

  // Create pending draft_state for the new week — auto-assign will fill it Sunday 14:00
  const nextWeekStart = getNextMonday();
  await supabase
    .from('draft_state')
    .upsert(
      { collective_id: collectiveId, week_start: nextWeekStart, status: 'pending' },
      { onConflict: 'collective_id,week_start' }
    );
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

function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getPrevMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}
