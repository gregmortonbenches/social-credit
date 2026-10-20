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
  if (!isServiceRoleCaller(req)) return new Response('Unauthorized', { status: 401 });
  return null;
}

/**
 * True when the caller holds the service role key.
 *
 * An exact match against SUPABASE_SERVICE_ROLE_KEY is not enough on its own: the
 * key the scheduler stores in the vault is the legacy JWT form, while the key the
 * runtime injects can be the newer `sb_secret_…` form. They are both the service
 * role, but never compared equal, so every cron call was answered 401 and the
 * scheduled functions have never run.
 *
 * So a token is also accepted when its `role` claim is `service_role`. Reading a
 * claim is only safe because these functions keep `verify_jwt` ON: the gateway has
 * then already checked the signature, so the payload cannot be forged. Never
 * deploy them with --no-verify-jwt.
 */
export function isServiceRoleCaller(req: Request): boolean {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return true;
  if (!authHeader.startsWith('Bearer ')) return false;
  const payload = authHeader.slice(7).split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims?.role === 'service_role';
  } catch {
    return false;
  }
}
