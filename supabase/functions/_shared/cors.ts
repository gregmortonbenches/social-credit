/**
 * CORS for the Edge Functions the app calls directly.
 *
 * Native clients are not subject to CORS; a browser is. It sends an OPTIONS
 * preflight (with no Authorization header) before the real request, and without
 * this the function's own auth check answered the preflight with a 401 carrying
 * no CORS headers, so the browser refused every call. That broke Force Assign,
 * completing a task, push notifications and account deletion on the web app.
 *
 * The bearer token travels in the Authorization header, not a cookie, so a
 * wildcard origin gives a third-party page nothing it could not already do
 * without the token. The cron-only functions are not wrapped: no browser calls
 * them.
 */
const HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function withCors(handler: (req: Request) => Promise<Response> | Response) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    const res = await handler(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
