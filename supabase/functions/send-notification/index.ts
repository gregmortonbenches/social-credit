import { initializeApp, cert, getApps } from 'https://esm.sh/firebase-admin@12/app';
import { getMessaging } from 'https://esm.sh/firebase-admin@12/messaging';

// Lazily initialise Firebase Admin (idempotent across warm starts)
if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')!)),
  });
}

interface NotificationPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { token, title, body, data } = payload;

    if (!token || !title || !body) {
      return new Response(JSON.stringify({ error: 'token, title, and body are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messaging = getMessaging();
    await messaging.send({
      token,
      notification: { title, body },
      data: data ?? {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

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
