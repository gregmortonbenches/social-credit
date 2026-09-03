# Google and Apple sign-in — setup

The code is in `lib/oauth.ts` and `components/auth/SocialSignIn.tsx`. **Neither
provider works until the steps below are done** — they need credentials and
console configuration that only the project owner can create. Until then both
buttons render, and fail with a readable message rather than a silent hang.

## 1. Redirect URL

Both flows return to the app's scheme, `socialcredit` (set in `app.json`):

```
socialcredit://auth-callback
```

Add it in Supabase → Authentication → URL Configuration → Redirect URLs.
Without it, Supabase refuses the redirect and Google sign-in ends on an error
page rather than back in the app.

## 2. Google

1. Google Cloud Console → APIs & Services → Credentials.
2. Create an **OAuth client ID** for **Web application**. The web client is the
   right one even for a native app here: the flow goes through Supabase, which
   is the party exchanging the code.
3. Authorised redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → Google: enable, and paste the client
   ID and client secret.

## 3. Apple

Apple sign-in only runs on a real iOS build — not Expo Go, not the simulator in
every case, and never on Android. The button hides itself where it cannot work.

1. Apple Developer → Certificates, Identifiers & Profiles.
2. Enable **Sign in with Apple** on the App ID `com.socialcredit.app`.
3. Create a **Services ID** for the web half of the flow, with return URL
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
4. Create a **Sign in with Apple key** (.p8) and note the Key ID and Team ID.
5. Supabase → Authentication → Providers → Apple: enable, and fill in the
   Services ID, Team ID, Key ID and the .p8 contents.
6. Add `expo-apple-authentication` to the `plugins` array in `app.json` before
   building, so the entitlement is included:

   ```json
   "plugins": ["expo-router", "expo-apple-authentication", ["expo-notifications", { "color": "#C20000" }]]
   ```

   This is deliberately **not** added yet: adding the entitlement before the
   Apple configuration exists makes iOS builds fail.

## 4. Rebuild

Both are native. A JS reload will not pick them up — you need a fresh dev client
or EAS build.

## Note on App Store review

Guideline 4.8 requires that an app offering third-party sign-in also offers Sign
in with Apple. That is why both ship together: enabling Google alone would fail
review.
