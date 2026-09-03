import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Sends the pushes for events the *client* causes.
 *
 * The three cron functions can notify people directly because they hold the
 * service role. Denouncing, responding to a denouncement, and joining a
 * collective all happen from the app, and `send-notification` requires the
 * service role — so these events sent nothing at all. Most conspicuously
 * "You have been Denounced!!", the app's signature mechanic: the accused had 24
 * hours to answer before automatic guilt and was never told.
 *
 * Nothing about the message or the recipient comes from the request. The caller
 * names an event and an id; this function reads the row, checks the caller is
 * the person entitled to trigger that event, and derives who to notify. A
 * caller cannot push arbitrary text at another member.
 */

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function pushTo(userIds: string[], title: string, body: string): Promise<number> {
  if (userIds.length === 0) return 0;
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, device_push_token')
    .in('id', userIds);

  let sent = 0;
  for (const p of profiles ?? []) {
    if (!p.device_push_token) continue;
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ token: p.device_push_token, title, body }),
    });
    sent++;
  }
  return sent;
}

async function usernameOf(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  return data?.username ?? 'Comrade';
}

Deno.serve(async (req) => {
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

  let event: string | undefined;
  let denouncementId: string | undefined;
  let collectiveId: string | undefined;
  try {
    ({ event, denouncementId, collectiveId } = await req.json());
  } catch {
    return json({ error: 'Malformed JSON body' }, 400);
  }

  try {
    if (event === 'denounced' || event === 'resisted') {
      if (!denouncementId) return json({ error: 'denouncementId is required' }, 400);

      const { data: d } = await supabaseAdmin
        .from('denouncements')
        .select('id, accuser_id, accused_id, status')
        .eq('id', denouncementId)
        .maybeSingle();
      if (!d) return json({ error: 'Denouncement not found' }, 404);

      if (event === 'denounced') {
        // Only the accuser announces the accusation, and only while it stands.
        if (d.accuser_id !== user.id) return new Response('Forbidden', { status: 403 });
        if (d.status !== 'open') return json({ ok: true, sent: 0, reason: 'not open' });
        const sent = await pushTo([d.accused_id], 'Denounced!', 'You have been Denounced!!');
        return json({ ok: true, sent });
      }

      // Only the accused announces their own response.
      if (d.accused_id !== user.id) return new Response('Forbidden', { status: 403 });
      if (d.status !== 'responded') return json({ ok: true, sent: 0, reason: 'not responded' });
      const name = await usernameOf(d.accused_id);
      const sent = await pushTo(
        [d.accuser_id],
        'A Comrade resists!',
        `Comrade ${name} resists the denunciation!`
      );
      return json({ ok: true, sent });
    }

    if (event === 'joined') {
      if (!collectiveId) return json({ error: 'collectiveId is required' }, 400);

      // The caller must actually be in the collective they claim to have joined.
      const { data: me } = await supabaseAdmin
        .from('collective_members')
        .select('user_id, status')
        .eq('collective_id', collectiveId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!me || me.status === 'left') return new Response('Forbidden', { status: 403 });

      const { data: others } = await supabaseAdmin
        .from('collective_members')
        .select('user_id')
        .eq('collective_id', collectiveId)
        .in('status', ['active', 'paused', 'pending'])
        .neq('user_id', user.id);

      const name = await usernameOf(user.id);
      const sent = await pushTo(
        (others ?? []).map((m) => m.user_id),
        'A new Comrade!',
        `Comrade ${name} has joined the Collective!`
      );
      return json({ ok: true, sent });
    }

    return json({ error: `Unknown event: ${event}` }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
