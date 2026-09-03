import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CONFIG } from '../../constants/config';
import { COLORS } from '../../constants/theme';
import type { MemberProfile, WeeklyAssignment } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useCollectiveStore } from '../../store/useCollectiveStore';
import { useDenouncementStore } from '../../store/useDenouncementStore';
import { useTaskStore } from '../../store/useTaskStore';
import { DenounceCard } from '../denouncements/DenounceCard';
import { WheatField } from './WheatField';

/** Cases still in play — resolved and withdrawn ones drop off the panel. */
function isActiveCase(d: { status: string }): boolean {
  return d.status !== 'resolved' && d.status !== 'withdrawn';
}

export function CollectivePanel() {
  const collective = useCollectiveStore((s) => s.collective);
  const members = useCollectiveStore((s) => s.members);
  const profile = useAuthStore((s) => s.profile);
  const { denouncements, fetchDenouncements, createDenouncement, withdrawDenouncement, myVotes } =
    useDenouncementStore();
  const allAssignments = useTaskStore((s) => s.allAssignments);

  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  const [quotaPercent, setQuotaPercent] = useState(0);
  const [voteCount, setVoteCount] = useState<Record<string, { uphold: number; dismiss: number }>>({});
  const [showDenounceModal, setShowDenounceModal] = useState(false);
  const [denounceAccusedId, setDenounceAccusedId] = useState('');
  const [denounceAssignmentId, setDenounceAssignmentId] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!collective) return;
    fetchDenouncements(collective.id);
    loadTaskNames();
  }, [collective]);

  // Keyed on the member set, not just the collective: `members` arrives from a
  // separate fetch and is updated live by the realtime subscription, so keying
  // this on `collective` alone meant a comrade who joined after you opened the
  // app never appeared in COMRADE STATUS. Keyed on the ids rather than the array
  // itself because the subscription hands back a new array on every event.
  const memberIdsKey = members.map((m) => m.user_id).sort().join(',');
  useEffect(() => {
    loadProfiles();
  }, [collective?.id, memberIdsKey]);

  useEffect(() => {
    const credits = allAssignments
      .filter((a) => a.status === 'complete' && a.credits_value)
      .reduce((sum, a) => sum + (a.credits_value ?? 0), 0);
    setQuotaPercent(Math.min(100, Math.round((credits / CONFIG.WEEKLY_CREDIT_POOL) * 100)));
  }, [allAssignments]);

  // Re-load vote counts when denouncements change
  useEffect(() => {
    if (denouncements.length > 0) loadVoteCounts();
  }, [denouncements]);

  // Subscribe to vote count changes via realtime
  useEffect(() => {
    if (!collective || denouncements.length === 0) return;
    // denouncement_votes has no collective_id column, so filter on the
    // denouncements actually on screen. Without a filter this subscription woke
    // on every vote cast anywhere in the database, by any household.
    const ids = denouncements.map((d) => d.id);
    const channel = supabase
      .channel(`denouncement_votes:${collective.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'denouncement_votes',
          filter: `denouncement_id=in.(${ids.join(',')})`,
        },
        loadVoteCounts
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [collective?.id, denouncements.map((d) => d.id).join(',')]);

  async function loadProfiles() {
    if (!collective) return;
    const ids = members.map((m) => m.user_id);
    if (ids.length === 0) return;
    // Not select('*'): that ships every member's email, device_push_token and
    // anonymous_token to every other member's device. Only these three are read.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, total_credits')
      .in('id', ids);
    if (error) {
      if (__DEV__) console.warn('[collective] profile load failed:', error.message);
      return;
    }
    setProfiles(data ?? []);
  }

  async function loadTaskNames() {
    const { data } = await supabase.from('task_library').select('id, name');
    if (data) setTaskNames(Object.fromEntries(data.map((t) => [t.id, t.name])));
  }

  async function loadVoteCounts() {
    if (denouncements.length === 0) return;
    const { data } = await supabase
      .from('denouncement_votes')
      .select('denouncement_id, vote')
      .in('denouncement_id', denouncements.map((d) => d.id));
    const counts: Record<string, { uphold: number; dismiss: number }> = {};
    for (const v of data ?? []) {
      if (!counts[v.denouncement_id]) counts[v.denouncement_id] = { uphold: 0, dismiss: 0 };
      counts[v.denouncement_id][v.vote as 'uphold' | 'dismiss']++;
    }
    setVoteCount(counts);
  }

  function profileName(userId: string): string {
    return profiles.find((p) => p.id === userId)?.username ?? 'Unknown';
  }

  function closeDenounceModal() {
    setShowDenounceModal(false);
    setDenounceAccusedId('');
    setDenounceAssignmentId('');
    setConfirming(false);
  }

  // Denouncing is a public accusation against someone you live with, with a
  // credit penalty and a 24-hour clock. It went off on a single tap.
  function handleWithdraw(denouncementId: string, accusedName: string) {
    Alert.alert(
      'Withdraw the denunciation?',
      `The case against Comrade ${accusedName} will be closed with no penalty to either of you.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawDenouncement(denouncementId);
            } catch (err: any) {
              Alert.alert('Could not withdraw', err?.message ?? 'Please try again, Comrade.');
            }
          },
        },
      ]
    );
  }

  const overdueAssignments: WeeklyAssignment[] = allAssignments.filter(
    (a) => a.status === 'pending' && new Date(a.due_date) < new Date() && a.user_id !== profile?.id
  );

  const eligibleAccused = members.filter(
    (m) => m.status === 'active' && m.user_id !== profile?.id
  );

  // Opening the denounce modal with nothing to denounce is a dead end: you pick
  // a comrade and are told there are no overdue tasks. Say so up front instead.
  const canDenounce = eligibleAccused.length > 0 && overdueAssignments.length > 0;

  async function handleInvite() {
    if (!collective) return;
    await Share.share({
      message: `Join my Collective on Social Credit! Code: ${collective.code}`,
    });
  }

  async function handleDenounce() {
    if (!collective || !profile || !denounceAccusedId || !denounceAssignmentId) return;
    try {
      await createDenouncement(collective.id, profile.id, denounceAccusedId, denounceAssignmentId);
      closeDenounceModal();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  const accusedAssignments = overdueAssignments.filter(
    (a) => a.user_id === denounceAccusedId
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.bannerText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
        {collective ? collective.display_name.toUpperCase() : 'THE COLLECTIVE'}
      </Text>
      <View style={styles.titleRule} />

      <WheatField quotaPercent={quotaPercent} />
      <Text style={styles.quotaLabel}>PROSPERITY: {quotaPercent}%</Text>

      <Text style={styles.sectionTitle}>COMRADE STATUS</Text>
      {[...profiles].sort((a, b) => b.total_credits - a.total_credits).map((p, i) => (
        <View key={p.id} style={styles.rankRow}>
          <Text style={styles.rankNum}>#{i + 1}</Text>
          <Text style={styles.rankName}>Comrade {p.username}</Text>
          <Text style={styles.rankCredits}>{p.total_credits}</Text>
        </View>
      ))}

      {denouncements.filter(isActiveCase).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>ACTIVE DENOUNCEMENTS</Text>
          {denouncements
            .filter(isActiveCase)
            .map((d) => (
              <View key={d.id}>
              <DenounceCard
                denouncement={d}
                accuserName={profileName(d.accuser_id)}
                accusedName={profileName(d.accused_id)}
                taskName={taskNames[
                  allAssignments.find((a) => a.id === d.assignment_id)?.task_id ?? ''
                ] ?? '—'}
                memberCount={members.filter((m) => m.status === 'active').length}
                myVote={myVotes[d.id]}
                upholdCount={voteCount[d.id]?.uphold ?? 0}
                dismissCount={voteCount[d.id]?.dismiss ?? 0}
              />
              {d.accuser_id === profile?.id && d.status === 'open' ? (
                <TouchableOpacity
                  style={styles.withdrawBtn}
                  onPress={() => handleWithdraw(d.id, profileName(d.accused_id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Withdraw the denunciation of Comrade ${profileName(d.accused_id)}`}
                >
                  <Text style={styles.withdrawText}>WITHDRAW THIS DENUNCIATION</Text>
                </TouchableOpacity>
              ) : null}
              </View>
            ))}
        </>
      )}

      <View style={styles.buttonStack}>
        <TouchableOpacity
          style={[styles.actionBtn, !canDenounce && styles.actionBtnDisabled]}
          onPress={() => setShowDenounceModal(true)}
          disabled={!canDenounce}
        >
          <Text style={styles.actionBtnText}>DENOUNCE A COMRADE!</Text>
        </TouchableOpacity>
        {!canDenounce && (
          <Text style={styles.denounceHint}>
            {eligibleAccused.length === 0
              ? 'No other Comrades to denounce yet. Invite your household.'
              : 'No Comrade has an overdue task. The Collective is in good order.'}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={handleInvite}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>INVITE COMRADES</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => router.push('/(app)/collective/preferences')}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>MY TASK PREFERENCES</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => router.push('/(app)/collective/edit-rooms')}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>EDIT ROOMS</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/(app)/settings')}>
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>COLLECTIVE SETTINGS</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showDenounceModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>DENOUNCE A COMRADE</Text>

            <Text style={styles.pickerLabel}>SELECT ACCUSED</Text>
            {eligibleAccused.map((m) => (
              <TouchableOpacity
                key={m.user_id}
                style={[styles.pickerRow, denounceAccusedId === m.user_id && styles.pickerRowSelected]}
                onPress={() => { setDenounceAccusedId(m.user_id); setDenounceAssignmentId(''); }}
              >
                <Text style={styles.pickerText}>Comrade {profileName(m.user_id)}</Text>
              </TouchableOpacity>
            ))}

            {denounceAccusedId !== '' && (
              <>
                <Text style={styles.pickerLabel}>SELECT FAILED TASK</Text>
                {accusedAssignments.length === 0 ? (
                  <Text style={styles.noTasks}>No overdue tasks found for this Comrade.</Text>
                ) : (
                  accusedAssignments.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.pickerRow, denounceAssignmentId === a.id && styles.pickerRowSelected]}
                      onPress={() => setDenounceAssignmentId(a.id)}
                    >
                      <Text style={styles.pickerText}>{taskNames[a.task_id] ?? '—'}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}

            {confirming ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>
                  You are accusing{' '}
                  <Text style={styles.confirmStrong}>Comrade {profileName(denounceAccusedId)}</Text>{' '}
                  of failing{' '}
                  <Text style={styles.confirmStrong}>
                    {taskNames[
                      accusedAssignments.find((a) => a.id === denounceAssignmentId)?.task_id ?? ''
                    ] ?? 'this duty'}
                  </Text>
                  .
                </Text>
                <Text style={styles.confirmText}>
                  The whole Collective will see it. They have{' '}
                  {CONFIG.DENOUNCE_RESPONSE_WINDOW_HOURS} hours to answer, after which
                  guilt is automatic. You can withdraw it until they reply.
                </Text>
              </View>
            ) : null}

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={confirming ? () => setConfirming(false) : closeDenounceModal}
                accessibilityRole="button"
                accessibilityLabel={confirming ? 'Back' : 'Cancel'}
              >
                <Text style={styles.cancelText}>{confirming ? 'BACK' : 'CANCEL'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.denounceBtn, (!denounceAccusedId || !denounceAssignmentId) && styles.denounceBtnDisabled]}
                onPress={confirming ? handleDenounce : () => setConfirming(true)}
                disabled={!denounceAccusedId || !denounceAssignmentId}
                accessibilityRole="button"
                accessibilityLabel={confirming ? 'Confirm the denunciation' : 'Review the denunciation'}
              >
                <Text style={styles.denounceBtnText}>{confirming ? 'CONFIRM' : 'DENOUNCE!'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  bannerText: { color: COLORS.primary, fontWeight: '900', letterSpacing: 3, fontSize: 26, marginBottom: 10, textAlign: 'center' },
  titleRule: { height: 3, backgroundColor: COLORS.primary, marginBottom: 16 },
  quotaLabel: { color: COLORS.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2, textAlign: 'center', marginBottom: 16 },
  sectionTitle: { color: COLORS.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 8, marginTop: 16 },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
  rankNum: { color: COLORS.muted, fontSize: 12, width: 28 },
  rankName: { flex: 1, color: COLORS.text, fontSize: 14 },
  rankCredits: { color: COLORS.accent, fontFamily: 'SpaceMono', fontSize: 14 },
  buttonStack: { gap: 10, marginTop: 24 },
  actionBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 0, alignItems: 'center' },
  actionBtnSecondary: { backgroundColor: 'transparent', borderWidth: 2, borderColor: COLORS.primary },
  actionBtnDisabled: { opacity: 0.4 },
  denounceHint: {
    color: COLORS.muted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: -4,
  },
  actionBtnText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  actionBtnTextSecondary: { color: COLORS.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.background, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: 24, borderTopWidth: 3, borderTopColor: COLORS.primary },
  modalTitle: { color: COLORS.primary, fontSize: 18, fontWeight: '900', letterSpacing: 3, marginBottom: 20, textAlign: 'center' },
  pickerLabel: { color: COLORS.muted, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 8, marginTop: 12 },
  pickerRow: { padding: 12, backgroundColor: COLORS.surface, borderRadius: 0, marginBottom: 6, borderWidth: 1, borderColor: 'transparent' },
  pickerRowSelected: { borderColor: COLORS.primary },
  pickerText: { color: COLORS.text, fontSize: 14 },
  noTasks: { color: COLORS.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, backgroundColor: COLORS.surface, borderRadius: 0, alignItems: 'center' },
  cancelText: { color: COLORS.muted, fontWeight: '700', letterSpacing: 1 },
  denounceBtn: { flex: 1, padding: 14, backgroundColor: COLORS.primary, borderRadius: 0, alignItems: 'center' },
  denounceBtnDisabled: { opacity: 0.5 },
  denounceBtnText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 1 },
  withdrawBtn: { paddingVertical: 10, alignItems: 'center', marginTop: -6, marginBottom: 12 },
  withdrawText: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  confirmBox: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    padding: 14,
    marginTop: 16,
  },
  confirmText: { color: COLORS.text, fontSize: 13, lineHeight: 20, marginBottom: 8 },
  confirmStrong: { fontWeight: '700', color: COLORS.primary },
});
