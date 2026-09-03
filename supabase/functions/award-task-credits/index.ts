import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Awards the completion credits for a single assignment, immediately.
 *
 * `credits_transaction` is `revoke execute ... from anon, authenticated`
 * (001_initial_schema.sql), so the client cannot call it — which meant the
 * award in `useTaskStore.completeTask` always failed silently and credits only
 * appeared at the Monday `weekly-reset`. This function is the missing piece:
 * it authenticates the caller, re-reads the assignment server-side to confirm
 * they own it and that it really is complete, and only then calls the RPC with
 * the service role.
 *
 * Nothing about the amount is taken from the request — `credits_value` is read
 * from the row — so a caller cannot award themselves an arbitrary number of
 * credits by editing the request body.
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Reject the service role key here: this endpoint is for a signed-in user
  // acting on their own assignment, and the anon key ships in the app bundle,
  // so we must resolve a real user from the JWT rather than trust the caller.
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let assignmentId: string | undefined;
  try {
    ({ assignmentId } = await req.json());
  } catch {
    return json({ error: 'Malformed JSON body' }, 400);
  }

  if (!assignmentId) {
    return json({ error: 'assignmentId is required' }, 400);
  }

  try {
    const { data: assignment, error: readError } = await supabaseAdmin
      .from('weekly_assignments')
      .select('id, user_id, collective_id, status, credits_value')
      .eq('id', assignmentId)
      .maybeSingle();

    if (readError) throw readError;
    if (!assignment) return json({ error: 'Assignment not found' }, 404);

    // Ownership: you may only settle your own assignment.
    if (assignment.user_id !== user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    // Only a genuinely completed assignment pays out. Without this a caller
    // could bank the credits for a task they have not done.
    if (assignment.status !== 'complete') {
      return json({ error: 'Assignment is not complete' }, 409);
    }

    // credits_value is null until auto-assign sets it at assignment time.
    if (!assignment.credits_value) {
      return json({ ok: true, awarded: 0, reason: 'no credits_value set' });
    }

    // Idempotency. The ledger is append-only and `weekly-reset` runs the same
    // dedup check, so a retry, a double tap, or the Monday job arriving after
    // this must not pay twice.
    const { data: existing, error: dedupError } = await supabaseAdmin
      .from('credit_ledger')
      .select('id')
      .eq('reference_id', assignment.id)
      .eq('reason', 'task_complete')
      .maybeSingle();

    if (dedupError) throw dedupError;
    if (existing) {
      return json({ ok: true, awarded: 0, reason: 'already awarded' });
    }

    const { error: rpcError } = await supabaseAdmin.rpc('credits_transaction', {
      p_user_id: assignment.user_id,
      p_collective_id: assignment.collective_id,
      p_delta: assignment.credits_value,
      p_reason: 'task_complete',
      p_reference_id: assignment.id,
    });
    if (rpcError) throw rpcError;

    return json({ ok: true, awarded: assignment.credits_value });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
