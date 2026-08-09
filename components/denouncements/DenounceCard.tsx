import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CONFIG } from '../../constants/config';
import { COLORS } from '../../constants/theme';
import type { Denouncement } from '../../lib/database.types';
import { useAuthStore } from '../../store/useAuthStore';
import { useDenouncementStore } from '../../store/useDenouncementStore';

interface Props {
  denouncement: Denouncement;
  accuserName: string;
  accusedName: string;
  taskName: string;
  memberCount: number;
  myVote: 'uphold' | 'dismiss' | undefined;
  upholdCount: number;
  dismissCount: number;
}

export function DenounceCard({
  denouncement,
  accuserName,
  accusedName,
  taskName,
  memberCount,
  myVote,
  upholdCount,
  dismissCount,
}: Props) {
  const profile = useAuthStore((s) => s.profile);
  const { submitExplanation, castVote } = useDenouncementStore();
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voting, setVoting] = useState(false);

  const isAccused = profile?.id === denouncement.accused_id;
  const isAccuser = profile?.id === denouncement.accuser_id;
  const canVote = !isAccused && !isAccuser && !myVote && denouncement.status === 'responded';
  const wordCount = explanation.trim().split(/\s+/).filter(Boolean).length;

  // Accuser and accused are barred from voting, so the eligible tribunal is
  // everyone else. Clamped at 0 for safety if membership shrinks mid-case.
  const eligibleVoters = Math.max(0, memberCount - 2);
  const castVotes = upholdCount + dismissCount;

  async function handleExplanation() {
    if (wordCount === 0) return;
    setSubmitting(true);
    try {
      await submitExplanation(denouncement.id, explanation);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(vote: 'uphold' | 'dismiss') {
    if (!profile) return;
    Alert.alert(
      vote === 'uphold' ? 'UPHOLD DENOUNCEMENT' : 'DISMISS DENOUNCEMENT',
      vote === 'uphold'
        ? `Confirm: uphold the denouncement of Comrade ${accusedName}?`
        : `Confirm: dismiss the case against Comrade ${accusedName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            // castVote throws on failure. Previously the returned promise was
            // dropped here, so a failed vote rejected unhandled and the voter
            // was told nothing at all.
            if (voting) return;
            setVoting(true);
            try {
              await castVote(denouncement.id, profile.id, vote);
            } catch {
              Alert.alert('Error', 'Your vote could not be recorded. Please try again, Comrade.');
            } finally {
              setVoting(false);
            }
          },
        },
      ]
    );
  }

  const statusLabel = {
    open: 'AWAITING RESPONSE',
    responded: 'VOTE IN PROGRESS',
    auto_guilty: 'AUTO-GUILTY',
    voted: 'VOTES TALLIED',
    resolved: denouncement.outcome === 'upheld' ? 'UPHELD' : 'DISMISSED',
  }[denouncement.status] ?? denouncement.status.toUpperCase();

  const statusColor =
    denouncement.status === 'resolved'
      ? denouncement.outcome === 'upheld' ? COLORS.danger : COLORS.muted
      : denouncement.status === 'auto_guilty' ? COLORS.danger : COLORS.accent;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>★ DENOUNCEMENT ★</Text>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={styles.body}>
        Comrade <Text style={styles.bold}>{accuserName}</Text> denounces Comrade{' '}
        <Text style={styles.bold}>{accusedName}</Text> for failing to:
      </Text>
      <Text style={styles.taskName}>"{taskName}"</Text>

      {denouncement.explanation && (
        <View style={styles.explanationBox}>
          <Text style={styles.explanationLabel}>DEFENCE</Text>
          <Text style={styles.explanationText}>{denouncement.explanation}</Text>
        </View>
      )}

      {isAccused && denouncement.status === 'open' && (
        <View style={styles.responseSection}>
          <Text style={styles.responseLabel}>
            WRITE YOUR DEFENCE, COMRADE ({wordCount}/{CONFIG.DENOUNCE_EXPLANATION_MAX_WORDS} words)
          </Text>
          <TextInput
            style={styles.responseInput}
            value={explanation}
            onChangeText={setExplanation}
            multiline
            placeholder="Defend your honour..."
            placeholderTextColor={COLORS.muted}
          />
          <TouchableOpacity
            style={[styles.resistBtn, (wordCount === 0 || submitting) && styles.resistBtnDisabled]}
            onPress={handleExplanation}
            disabled={wordCount === 0 || submitting}
          >
            <Text style={styles.resistBtnText}>RESIST THE DENUNCIATION!</Text>
          </TouchableOpacity>
        </View>
      )}

      {canVote && (
        <View style={styles.voteRow}>
          <TouchableOpacity
            style={[styles.upholdBtn, voting && styles.voteBtnBusy]}
            onPress={() => handleVote('uphold')}
            disabled={voting}
            accessibilityRole="button"
            accessibilityLabel={`Uphold the denouncement of Comrade ${accusedName}`}
          >
            <Text style={styles.upholdText}>UPHOLD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dismissBtn, voting && styles.voteBtnBusy]}
            onPress={() => handleVote('dismiss')}
            disabled={voting}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss the case against Comrade ${accusedName}`}
          >
            <Text style={styles.dismissText}>DISMISS</Text>
          </TouchableOpacity>
        </View>
      )}

      {(myVote || denouncement.status === 'resolved') && (
        <View style={styles.tallySection}>
          <Text style={styles.tallyLabel}>TRIBUNAL VOTE</Text>
          <View style={styles.tallyRow}>
            <View style={styles.tallyUphold}>
              <Text style={styles.tallyCount}>{upholdCount}</Text>
              <Text style={styles.tallyRowLabel}>UPHOLD</Text>
            </View>
            <View style={styles.tallyDivider} />
            <View style={styles.tallyDismiss}>
              <Text style={styles.tallyCountDismiss}>{dismissCount}</Text>
              <Text style={styles.tallyRowLabelDismiss}>DISMISS</Text>
            </View>
          </View>
          {denouncement.status !== 'resolved' && (
            <Text style={styles.tallyProgress}>
              {castVotes} OF {eligibleVoters} COMRADES HAVE VOTED
            </Text>
          )}
        </View>
      )}

      {denouncement.status === 'resolved' && (
        <View style={[styles.stamp, denouncement.outcome === 'upheld' ? styles.stampUpheld : styles.stampDismissed]}>
          <Text style={styles.stampText}>{denouncement.outcome?.toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F5F0E8',
    borderWidth: 3,
    borderColor: COLORS.primary,
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { color: COLORS.primary, fontWeight: '900', fontSize: 14, letterSpacing: 2 },
  statusBadge: { borderWidth: 1.5, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  body: { color: '#3D1515', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  bold: { fontWeight: '700' },
  taskName: { color: COLORS.primary, fontSize: 15, fontWeight: '700', fontStyle: 'italic', marginBottom: 12 },
  explanationBox: {
    backgroundColor: '#EDE8D8',
    borderRadius: 3,
    padding: 10,
    marginBottom: 12,
  },
  explanationLabel: { color: '#8B6000', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  explanationText: { color: '#3D2020', fontSize: 13, lineHeight: 18 },
  responseSection: { marginTop: 8 },
  responseLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  responseInput: {
    backgroundColor: '#EDE8D8',
    borderWidth: 1,
    borderColor: '#C0A080',
    borderRadius: 3,
    padding: 10,
    color: '#000000',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  resistBtn: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 0,
    alignItems: 'center',
  },
  resistBtnDisabled: { opacity: 0.5 },
  resistBtnText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 1, fontSize: 12 },
  voteRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  upholdBtn: { flex: 1, backgroundColor: COLORS.primary, padding: 10, borderRadius: 0, alignItems: 'center' },
  upholdText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 1, fontSize: 12 },
  dismissBtn: { flex: 1, backgroundColor: '#F5F0E8', borderWidth: 2, borderColor: COLORS.muted, padding: 10, borderRadius: 0, alignItems: 'center' },
  dismissText: { color: COLORS.muted, fontWeight: '700', letterSpacing: 1, fontSize: 12 },
  voteBtnBusy: { opacity: 0.5 },
  tallySection: { marginTop: 12, borderWidth: 1, borderColor: COLORS.muted },
  tallyLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 2, textAlign: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.muted },
  tallyRow: { flexDirection: 'row' },
  tallyUphold: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: COLORS.primary },
  tallyDismiss: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: '#F5F0E8' },
  tallyDivider: { width: 2, backgroundColor: COLORS.muted },
  tallyCount: { fontSize: 22, fontWeight: '900', fontFamily: 'SpaceMono', color: '#FFFFFF' },
  tallyCountDismiss: { fontSize: 22, fontWeight: '900', fontFamily: 'SpaceMono', color: COLORS.muted },
  tallyRowLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 2, color: '#FFFFFF' },
  tallyRowLabelDismiss: { fontSize: 9, fontWeight: '700', letterSpacing: 2, color: COLORS.muted },
  tallyProgress: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: COLORS.muted,
  },
  stamp: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderRadius: 3,
    transform: [{ rotate: '8deg' }],
  },
  stampUpheld: { borderColor: COLORS.danger },
  stampDismissed: { borderColor: COLORS.muted },
  stampText: { fontWeight: '900', fontSize: 13, letterSpacing: 2, color: COLORS.danger },
});
