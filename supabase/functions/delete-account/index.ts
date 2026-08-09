import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify the caller's session JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = user.id;

  try {
    // Anonymise history — set user_id to NULL so references show "Former Comrade"
    // (requires weekly_assignments.user_id and credit_ledger.user_id to be nullable
    //  as per migration 002_security_fixes.sql)
    await supabaseAdmin
      .from('weekly_assignments')
      .update({ user_id: null } as any)
      .eq('user_id', userId);

    await supabaseAdmin
      .from('credit_ledger')
      .update({ user_id: null } as any)
      .eq('user_id', userId);

    // Redact denouncement text for both sides of any denouncement involving this user
    await supabaseAdmin
      .from('denouncements')
      .update({ explanation: '[content removed]' })
      .eq('accused_id', userId);

    await supabaseAdmin
      .from('denouncements')
      .update({ explanation: '[content removed]' })
      .eq('accuser_id', userId);

    // Remove achievements (personal data, not shared history)
    await supabaseAdmin
      .from('achievements')
      .delete()
      .eq('user_id', userId);

    // Hard-delete the auth user — cascades to profiles
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
