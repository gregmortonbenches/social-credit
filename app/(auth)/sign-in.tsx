import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { PropagandaButton } from '../../components/ui/PropagandaButton';
import { PropagandaInput } from '../../components/ui/PropagandaInput';
import { getRandomProverb } from '../../constants/proverbs';
import { COLORS } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';

const PROVERB = getRandomProverb();

export default function SignInScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError('Email and password are required, Comrade.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      router.replace('/(app)');
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>SOCIAL CREDIT</Text>
        <Text style={styles.subtitle}>{PROVERB}</Text>
        <Text style={styles.heading}>REPORT FOR DUTY</Text>

        {error ? <Text style={styles.errorBox}>{error}</Text> : null}

        <PropagandaInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <PropagandaInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          showToggle
        />

        <PropagandaButton title="Report for Duty" onPress={handleSignIn} loading={loading} style={styles.btn} />

        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-up')}>
          <Text style={styles.link}>New Comrade? Enlist Here</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 24, paddingTop: 80 },
  title: {
    color: COLORS.primary,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 40,
  },
  heading: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 24,
  },
  errorBox: {
    color: COLORS.danger,
    backgroundColor: '#3D1010',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
    fontSize: 14,
  },
  btn: { marginTop: 24, marginBottom: 16 },
  link: { color: COLORS.accent, textAlign: 'center', fontSize: 14, letterSpacing: 1 },
});
