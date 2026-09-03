import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PropagandaButton } from '../../../components/ui/PropagandaButton';
import { PropagandaInput } from '../../../components/ui/PropagandaInput';
import { CONFIG } from '../../../constants/config';
import { COLORS } from '../../../constants/theme';
import type { CollectiveSummary } from '../../../lib/database.types';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCollectiveStore } from '../../../store/useCollectiveStore';

export default function JoinCollectiveScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { lookupCollective, joinCollective } = useCollectiveStore();
  const params = useLocalSearchParams<{ code?: string }>();

  const [code, setCode] = useState(params.code ?? '');
  const [foundCollective, setFoundCollective] = useState<CollectiveSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      const parsed = Linking.parse(url);
      if (parsed.queryParams?.code) {
        setCode(String(parsed.queryParams.code));
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  async function handleLookup() {
    if (code.length !== CONFIG.COLLECTIVE_CODE_LENGTH) {
      setError(`Code must be ${CONFIG.COLLECTIVE_CODE_LENGTH} digits`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const collective = await lookupCollective(code);
      setFoundCollective(collective);
    } catch (err: any) {
      setError(err.message ?? 'Collective not found');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!foundCollective || !profile) return;
    setJoining(true);
    try {
      await joinCollective(code, profile.id);
      router.replace('/(app)');
    } catch (err: any) {
      setError(err.message ?? 'Failed to join Collective');
    } finally {
      setJoining(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>JOIN A COLLECTIVE</Text>

        {!foundCollective ? (
          <>
            <Text style={styles.hint}>Enter the 5-digit code to locate your Collective.</Text>
            <PropagandaInput
              label="Collective Code"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              maxLength={5}
              error={error}
              style={styles.codeInput}
            />
            <PropagandaButton title="Find Collective" onPress={handleLookup} loading={loading} />
          </>
        ) : (
          <View style={styles.confirmBox}>
            <Text style={styles.foundLabel}>COLLECTIVE FOUND</Text>
            <Text style={styles.collectiveName}>{foundCollective.display_name}</Text>

            <View style={styles.midWeekNotice}>
              <Text style={styles.midWeekText}>
                Unless you join on a Monday, you become a full member at the next
                Monday reset and receive duties from the assignment that follows.
                The Collective&apos;s own timezone decides this, not your device.{'\n'}
                Starting balance: <Text style={styles.credits}>{CONFIG.STARTING_CREDITS} credits</Text>
              </Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <PropagandaButton
              title="Join the Collective!"
              onPress={handleConfirm}
              loading={joining}
              style={styles.btn}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 24, paddingTop: 60 },
  title: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 32,
    textAlign: 'center',
  },
  hint: { color: COLORS.muted, fontSize: 14, marginBottom: 20 },
  codeInput: { fontSize: 28, textAlign: 'center', letterSpacing: 8 },
  confirmBox: { alignItems: 'center', gap: 16 },
  foundLabel: { color: COLORS.accent, fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  collectiveName: { color: COLORS.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  midWeekNotice: {
    backgroundColor: COLORS.surface,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: 16,
    width: '100%',
  },
  midWeekText: { color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  credits: { color: COLORS.accent, fontWeight: '700' },
  errorText: { color: COLORS.danger, fontSize: 13 },
  btn: { marginTop: 8, width: '100%' },
});
