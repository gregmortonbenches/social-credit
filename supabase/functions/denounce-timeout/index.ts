import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rejectNonCronCaller } from '../_shared/cron-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Mirrors of the CONFIG.DENOUNCE_* values in constants/config.ts — an Edge
// Function cannot import from the app's source tree, so update both together.
const RESPONSE_WINDOW_HOURS = 24;
const VOTE_WINDOW_HOURS = 24;
const ACCUSER_REWARD = 100;
const ACCUSER_PENALTY = 50;
const TWO_PERSON_ABUSE_THRESHOLD = 3;
const TWO_PERSON_ABUSE_PENALTY = 150;
const TWO_PERSON_WINDOW_DAYS = 60;

/**
 * Settles every denouncement that is due: unanswered past the response window
 * (auto-guilty), and answered ones whose jurors have all voted or whose vote
 * window has closed. The rules and the credit movements live in the
 * `settle_denouncements` database function (migration 020), so that a verdict and
 * its credits commit in one transaction. This used to flip the status here and
 * then make two rpc calls whose errors nobody read: a failed call left the case
 * 'auto_guilty' with no penalty, which no later run would revisit.
 */
Deno.serve(async (req) => {
  const denied = rejectNonCronCaller(req);
  if (denied) return denied;

  const { data: settled, error } = await supabase.rpc('settle_denouncements', {
    p_response_hours: RESPONSE_WINDOW_HOURS,
    p_vote_hours: VOTE_WINDOW_HOURS,
    p_accuser_reward: ACCUSER_REWARD,
    p_accuser_penalty: ACCUSER_PENALTY,
    p_abuse_threshold: TWO_PERSON_ABUSE_THRESHOLD,
    p_abuse_penalty: TWO_PERSON_ABUSE_PENALTY,
    p_abuse_window_days: TWO_PERSON_WINDOW_DAYS,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message ?? String(error) }), { status: 500 });
  }

  const results: string[] = [];

  for (const d of settled ?? []) {
    results.push(`${d.o_status}/${d.o_outcome}: ${d.o_id}`);

    // The credits have already moved; a failed push must not undo or hide that.
    if (d.o_status !== 'auto_guilty') continue;
    try {
      await notifyUser(d.o_accused_id, {
        title: 'Denouncement Outcome',
        body: 'You did not respond to the denouncement in time. Verdict: AUTO-GUILTY.',
      });
    } catch (err) {
      results.push(`Push failed ${d.o_id}: ${String(err)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

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
