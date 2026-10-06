import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3';
import { rejectNonCronCaller } from '../_shared/cron-auth.ts';
import { nextStreak, weekOutcome, weekStartKey } from '../_shared/prosperity.ts';

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
    .select('id, timezone, reset_week');

  if (error) return new Response(JSON.stringify({ error: String(error) }), { status: 500 });

  const results: string[] = [];

  for (const collective of collectives ?? []) {
    try {
      // A Collective is due when its local week has moved past the one it last
      // reset into. This replaces "is it Monday 00:xx right now?", which skipped
      // the whole week if the hourly cron missed that one hour: nothing settled,
      // no draft_state for the next week, so no tasks were ever assigned. Every
      // step below is idempotent, so an extra run in the same week is harmless.
      const localNow = toZonedTime(utcNow, collective.timezone);
      const thisWeek = weekStartKey(localNow, 0);

      if (!collective.reset_week || collective.reset_week < thisWeek) {
        await runWeeklyReset(collective.id, collective.timezone, thisWeek);
        results.push(`Reset ${collective.id}`);
      }
    } catch (err) {
      results.push(`Error ${collective.id}: ${errorMessage(err)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

/** supabase-js returns PostgREST errors as plain objects, which String() flattens to "[object Object]". */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return JSON.stringify(err);
}

async function runWeeklyReset(collectiveId: string, timezone: string, thisWeek: string) {
  const nowDate = new Date();
  // The week that just ended, and the one after the new one, both worked out in
  // the collective's timezone. This used to take the UTC date, which is wrong for
  // any collective at or west of UTC (Monday 00:00 local is already Monday in UTC
  // there, so "previous Monday" came out as the week that was only just starting).
  const localNow = toZonedTime(nowDate, timezone);
  const weekStart = weekStartKey(localNow, -1);

  // Fail what is overdue and pay what is complete but unpaid. One database
  // transaction per Collective-week (migration 020): a task is marked failed
  // together with its penalty or not at all. This used to be a status update
  // followed by an rpc whose error nobody read, so a transient failure left a
  // task 'failed' with no penalty, and no later run would look at it again.
  const { error: settleError } = await supabase.rpc('settle_assignments', {
    p_collective_id: collectiveId,
    p_week_start: weekStart,
    p_now: nowDate.toISOString(),
  });
  if (settleError) throw settleError;

  await settleProsperity(collectiveId, weekStart);

  // Promote anyone who joined mid-week. join_collective_by_code() enrols a
  // joiner as 'pending' unless they joined on a Monday in the collective's
  // timezone (migration 013), and the new week starting is exactly when they
  // become active. Without this step a mid-week joiner stays pending
  // indefinitely: they can see the collective but auto-assign skips them, so
  // they never receive a task.
  const { error: promoteError } = await supabase
    .from('collective_members')
    .update({ status: 'active' })
    .eq('collective_id', collectiveId)
    .eq('status', 'pending');
  if (promoteError) throw promoteError;

  // Create pending draft_state for the new week — auto-assign will fill it Sunday 14:00
  const nextWeekStart = weekStartKey(localNow, 1);
  const { error: draftError } = await supabase
    .from('draft_state')
    .upsert(
      { collective_id: collectiveId, week_start: nextWeekStart, status: 'pending' },
      { onConflict: 'collective_id,week_start', ignoreDuplicates: true }
    );
  if (draftError) throw draftError;

  // Last, and only if everything above succeeded: a failure anywhere leaves
  // reset_week behind, so the next hourly run tries again.
  const { error: stampError } = await supabase
    .from('collectives')
    .update({ reset_week: thisWeek })
    .eq('id', collectiveId);
  if (stampError) throw stampError;
}

/**
 * The Collective's prosperity streak: one more perfect week, or back to zero.
 * Runs after failed tasks have been marked, so a late task is already 'failed'.
 * `prosperity_week` guards against counting the same week twice when the hourly
 * cron fires more than once inside Monday 00:00. See migration 019.
 */
async function settleProsperity(collectiveId: string, weekStart: string) {
  const { data: collective, error: collectiveError } = await supabase
    .from('collectives')
    .select('prosperity_streak, prosperity_week')
    .eq('id', collectiveId)
    .single();
  if (collectiveError) throw collectiveError;
  if (collective.prosperity_week === weekStart) return;

  const { data: assignments, error: assignmentsError } = await supabase
    .from('weekly_assignments')
    .select('id, status')
    .eq('collective_id', collectiveId)
    .eq('week_start', weekStart);
  if (assignmentsError) throw assignmentsError;

  // Only worth asking if every duty was done: any failure already settles it.
  let upheld = false;
  const rows = assignments ?? [];
  const counted = rows.filter((a) => a.status !== 'reassigned');
  if (counted.length > 0 && counted.every((a) => a.status === 'complete')) {
    const { count, error: denounceError } = await supabase
      .from('denouncements')
      .select('id', { count: 'exact', head: true })
      .in('assignment_id', counted.map((a) => a.id))
      .or('status.eq.auto_guilty,outcome.eq.upheld');
    if (denounceError) throw denounceError;
    upheld = (count ?? 0) > 0;
  }

  const outcome = weekOutcome(rows, upheld);
  if (outcome === 'empty') return; // nothing to fulfil or fail: leave the streak alone

  const { error } = await supabase
    .from('collectives')
    .update({
      prosperity_streak: nextStreak(collective.prosperity_streak, outcome),
      prosperity_week: weekStart,
    })
    .eq('id', collectiveId);
  if (error) throw error;
}
