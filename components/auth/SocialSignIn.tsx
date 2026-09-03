import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '../../lib/oauth';

/**
 * Google and Apple buttons, shared by sign-in and sign-up — with these
 * providers the two are the same action, so showing different copy on each
 * screen would imply a distinction that does not exist.
 *
 * Apple's button only appears where Apple sign-in genuinely works (iOS). App
 * Store guideline 4.8 requires offering Apple alongside other third-party
 * sign-in options, which is why these two ship together rather than Google
 * alone.
 */
export function SocialSignIn({ onError }: { onError: (message: string) => void }) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function run(which: 'google' | 'apple') {
    if (busy) return;
    setBusy(which);
    try {
      await (which === 'google' ? signInWithGoogle() : signInWithApple());
    } catch (err: any) {
      // The user backing out of the native Apple sheet is not a failure.
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      onError(err?.message ?? 'Sign-in failed. Please try again, Comrade.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.rule} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.rule} />
      </View>

      <TouchableOpacity
        style={styles.btn}
        onPress={() => run('google')}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ disabled: busy !== null, busy: busy === 'google' }}
      >
        {busy === 'google' ? (
          <ActivityIndicator color={COLORS.text} />
        ) : (
          <Text style={styles.btnText}>CONTINUE WITH GOOGLE</Text>
        )}
      </TouchableOpacity>

      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={0}
          style={styles.appleBtn}
          onPress={() => run('apple')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  rule: { flex: 1, height: 1, backgroundColor: COLORS.muted, opacity: 0.4 },
  dividerText: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  btn: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnText: { color: COLORS.text, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  // Apple require their own button, at their own proportions. 44 is the minimum
  // tap target and also close to their recommended height.
  appleBtn: { height: 48, width: '100%' },
});
