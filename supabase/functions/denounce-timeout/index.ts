import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rejectNonCronCaller } from '../_shared/cron-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Mirror of CONFIG.DENOUNCE_RESPONSE_WINDOW_HOURS — update if config changes
const RESPONSE_WINDOW_HOURS = 24;
// Mirror of CONFIG.DENOUNCE_ACCUSER_REWARD — update if config changes
const DENOUNCE_ACCUSER_REWARD = 100;

Deno.serve(async (req) => {
  const denied = rejectNonCronCaller(req);
  if (denied) return denied;

  const cutoff = new Date(Date.now() - RESPONSE_WINDOW_HOURS * 3600000).toISOString();

  const { data: timedOut, error } = await supabase
    .from('denouncements')
    .select('*, weekly_assignments(credits_value, user_id)')
    .eq('status', 'open')
    .lt('created_at', cutoff);

  if (error) return new Response(JSON.stringify({ error: String(error) }), { status: 500 });

  const results: string[] = [];

  for (const d of timedOut ?? []) {
    try {
      await supabase
        .from('denouncements')
        .update({ status: 'auto_guilty', resolved_at: new Date().toISOString(), outcome: 'upheld' })
        .eq('id', d.id);

      const creditsValue = d.weekly_assignments?.credits_value;
      if (creditsValue) {
        await supabase.rpc('credits_transaction', {
          p_user_id: d.accused_id,
          p_collective_id: d.collective_id,
          p_delta: -creditsValue,
          p_reason: 'denouncement_auto_guilty',
          p_reference_id: d.id,
        });

        await supabase.rpc('credits_transaction', {
          p_user_id: d.accuser_id,
          p_collective_id: d.collective_id,
          p_delta: DENOUNCE_ACCUSER_REWARD,
          p_reason: 'denouncement_upheld_reward',
          p_reference_id: d.id,
        });
      }

      await notifyUser(d.accused_id, {
        title: 'Denouncement Outcome',
        body: 'You did not respond to the denouncement in time. Verdict: AUTO-GUILTY.',
      });

      results.push(`Auto-guilty: ${d.id}`);
    } catch (err) {
      results.push(`Error ${d.id}: ${String(err)}`);
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
