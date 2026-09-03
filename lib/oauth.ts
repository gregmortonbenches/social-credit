import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Google and Apple sign-in (decision 7).
 *
 * The dependencies for both have been in package.json since the start with no
 * code behind them, so the app has been email/password only.
 *
 * NEITHER PROVIDER WORKS UNTIL IT IS CONFIGURED — see docs/AUTH_SETUP.md. Both
 * functions surface a clear error rather than failing obscurely when the
 * provider has not been set up in Supabase.
 */

// Required so the auth browser tab closes itself and hands control back.
WebBrowser.maybeCompleteAuthSession();

/** Where the provider sends the user back to. Must be registered in Supabase. */
export function authRedirectUrl(): string {
  return Linking.createURL('auth-callback');
}

/**
 * Google, via the system browser.
 *
 * Supabase issues the provider URL, we open it in an auth session, and the
 * redirect comes back carrying a PKCE code that is exchanged for a session.
 * `skipBrowserRedirect` keeps the navigation ours to control.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = authRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Google sign-in is not configured for this project.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    // Cancelled or dismissed — not an error worth shouting about.
    return;
  }

  const code = Linking.parse(result.url).queryParams?.code;
  if (!code) throw new Error('Google did not return an authorisation code.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(String(code));
  if (exchangeError) throw exchangeError;
}

/**
 * Apple, via the native sheet. iOS only — `isAvailableAsync` is false elsewhere.
 *
 * A nonce is generated and its SHA-256 sent to Apple; Apple embeds the digest in
 * the identity token, and Supabase is given the raw value to compare. That is
 * what stops a token captured elsewhere being replayed here.
 */
export async function signInWithApple(): Promise<void> {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('Sign in with Apple is only available on iOS.');
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}

/** True when the Apple button should be shown at all. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
