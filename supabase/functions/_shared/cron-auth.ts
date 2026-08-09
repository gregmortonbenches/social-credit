/**
 * Caller guard for the scheduled (cron) Edge Functions.
 *
 * These functions run with the service role key and act on every collective in
 * the database, so they must only ever be invoked by the scheduler — never by
 * an app user.
 *
 * Supabase's default `verify_jwt` is not sufficient on its own: it proves the
 * caller presented *a* valid key, and the anon key is embedded in the shipped
 * mobile app. Any user could therefore read it out and invoke these endpoints
 * directly. So we require the service role key explicitly, matching the guard
 * `send-notification` already uses.
 *
 * DEPLOYMENT: the scheduler must send `Authorization: Bearer <service role key>`.
 * See supabase/functions/README.md.
 */
export function rejectNonCronCaller(req: Request): Response | null {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}
