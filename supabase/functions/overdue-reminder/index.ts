import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rejectNonCronCaller } from '../_shared/cron-auth.ts';

/**
 * "A task is overdue, Comrade. Do not fail the Collective."
 *
 * This notification was specified but never sent by anything. It was also close
 * to pointless before deadlines were staggered: every task in a week fell due at
 * the same Sunday 23:59, an hour before weekly-reset failed it, so there was no
 * useful moment to warn anyone. With deadlines spread across the week a task can
 * now be overdue on a Tuesday with six days still to save it.
 *
 * Sends once per assignment. `notified_overdue_at` is the guard — without it an
 * hourly cron would nag the same person about the same chore every hour until
 * the Monday reset.
 */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const denied = rejectNonCronCaller(req);
  if (denied) return denied;

  try {
    const now = new Date().toISOString();

    const { data: overdue, error } = await supabase
      .from('weekly_assignments')
      .select('id, user_id')
      .eq('status', 'pending')
      .lt('due_date', now)
      .is('notified_overdue_at', null)
      .not('user_id', 'is', null);

    if (error) throw error;

    let sent = 0;
    for (const a of overdue ?? []) {
      // Mark first. A push that fails is better than a loop that re-sends every
      // hour because the write never happened.
      await supabase
        .from('weekly_assignments')
        .update({ notified_overdue_at: now })
        .eq('id', a.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('device_push_token')
        .eq('id', a.user_id)
        .maybeSingle();

      if (!profile?.device_push_token) continue;

      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          token: profile.device_push_token,
          title: 'Duty overdue',
          body: 'A task is overdue, Comrade. Do not fail the Collective.',
        }),
      });
      sent++;
    }

    return new Response(JSON.stringify({ ok: true, considered: (overdue ?? []).length, sent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
