import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PropagandaButton } from '../../components/ui/PropagandaButton';
import { PropagandaInput } from '../../components/ui/PropagandaInput';
import { getRandomProverb } from '../../constants/proverbs';
import { COLORS } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';

const PROVERB = getRandomProverb();

function formatDob(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export default function SignUpScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!username.trim()) errs.username = 'Username is required';
    if (!email.trim()) errs.email = 'Email is required';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!dob || dob.length < 10) {
      errs.dob = 'Date of birth is required (DD-MM-YYYY)';
    } else {
      const [dd, mm, yyyy] = dob.split('-').map(Number);
      const dobDate = new Date(yyyy, mm - 1, dd);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 16);
      if (isNaN(dobDate.getTime()) || dobDate > cutoff)
        errs.dob = 'You must be 16 or older to join the Collective';
    }
    if (!agreed) errs.agreed = 'You must agree to the terms to proceed';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSignUp() {
    if (!validate()) return;
    setLoading(true);
    try {
      await signUp(email.trim(), password, username.trim());
      router.replace('/(onboarding)/slide-1');
    } catch (err: any) {
      setErrors({ general: err.message ?? 'Sign up failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>SOCIAL CREDIT</Text>
        <Text style={styles.subtitle}>{PROVERB}</Text>
        <Text style={styles.heading}>ENLIST, COMRADE</Text>

        {errors.general ? <Text style={styles.generalError}>{errors.general}</Text> : null}

        <PropagandaInput
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          error={errors.username}
        />
        <PropagandaInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />
        <PropagandaInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          showToggle
          error={errors.password}
        />
        <PropagandaInput
          label="Date of Birth (DD-MM-YYYY)"
          value={dob}
          onChangeText={(t) => setDob(formatDob(t))}
          placeholder="01-01-1990"
          keyboardType="number-pad"
          error={errors.dob}
        />

        <TouchableOpacity style={styles.checkRow} onPress={() => setAgreed((v) => !v)}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.checkLabel}>
            I agree to the Privacy Policy and Terms of Service
          </Text>
        </TouchableOpacity>
        {errors.agreed ? <Text style={styles.errorText}>{errors.agreed}</Text> : null}

        <PropagandaButton title="Enlist!" onPress={handleSignUp} loading={loading} style={styles.btn} />

        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={styles.link}>Already a Comrade? Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 24, paddingTop: 60 },
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
    marginBottom: 32,
  },
  heading: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 24,
  },
  generalError: {
    color: COLORS.danger,
    backgroundColor: '#3D1010',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
    fontSize: 14,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: COLORS.muted,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  checkLabel: { flex: 1, color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  errorText: { color: COLORS.danger, fontSize: 12, marginBottom: 12 },
  btn: { marginTop: 24, marginBottom: 16 },
  link: { color: COLORS.accent, textAlign: 'center', fontSize: 14, letterSpacing: 1 },
});
