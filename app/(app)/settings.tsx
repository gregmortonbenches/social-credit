import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PropagandaButton } from '../../components/ui/PropagandaButton';
import { COLORS } from '../../constants/theme';
import { collectiveWeekStart } from '../../lib/draft';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useCollectiveStore } from '../../store/useCollectiveStore';
import { useTaskStore } from '../../store/useTaskStore';

export default function SettingsScreen() {
  const { profile, signOut, updateProfile } = useAuthStore();
  const { collective, leaveCollective, members, fetchCollective } = useCollectiveStore();
  const { fetchAssignments } = useTaskStore();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [savingUsername, setSavingUsername] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [copied, setCopied] = useState(false);

  const myMembership = members.find((m) => m.user_id === profile?.id);
  const isPaused = myMembership?.status === 'paused';

  async function handleSaveUsername() {
    if (!username.trim()) return;
    setSavingUsername(true);
    try {
      await updateProfile({ username: username.trim() });
    } finally {
      setSavingUsername(false);
    }
  }

  async function handleLeaveCollective() {
    if (!collective || !profile) return;
    Alert.alert(
      'LEAVE COLLECTIVE',
      'Your tasks will be reassigned. Your credits will be frozen until you rejoin a Collective. Are you sure, Comrade?',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await leaveCollective(collective.id, profile.id);
            router.replace('/(app)');
          },
        },
      ]
    );
  }

  async function handleHolidayPause(enable: boolean) {
    if (!collective || !profile) return;
    if (enable) {
      Alert.alert(
        'HOLIDAY PAUSE',
        'Your tasks will be redistributed to other Comrades, Comrade. You will re-enter the draft next Sunday.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm Pause',
            onPress: async () => {
              // collective_members is not directly writable from the client —
              // status transitions go through the RPCs added in migration 013,
              // which check the current status before writing.
              const { error } = await supabase.rpc('pause_membership', {
                p_collective_id: collective.id,
              });
              if (error) {
                Alert.alert('Could not pause', error.message);
                return;
              }
              await fetchCollective(collective.id);
            },
          },
        ]
      );
    } else {
      const { error } = await supabase.rpc('resume_membership', {
        p_collective_id: collective.id,
      });
      if (error) {
        Alert.alert('Could not resume', error.message);
        return;
      }
      await fetchCollective(collective.id);
    }
  }

  async function handleDownloadData() {
    if (!profile) return;
    const [assignments, ledger, denouncementsData, achievementsData] = await Promise.all([
      supabase.from('weekly_assignments').select('*').eq('user_id', profile.id),
      supabase.from('credit_ledger').select('*').eq('user_id', profile.id),
      supabase.from('denouncements').select('*').or(`accuser_id.eq.${profile.id},accused_id.eq.${profile.id}`),
      supabase.from('achievements').select('*').eq('user_id', profile.id),
    ]);

    // Exclude sensitive fields from the export
    const { is_admin, anonymous_token, device_push_token, ...safeProfile } = profile;

    const exportData = {
      profile: safeProfile,
      assignments: assignments.data,
      creditLedger: ledger.data,
      denouncements: denouncementsData.data,
      achievements: achievementsData.data,
      exportedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(exportData, null, 2);
    try {
      await Share.share({ message: json, title: 'My Social Credit Data' });
    } catch {
      Alert.alert('Export', json.substring(0, 500) + '...');
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') {
      Alert.alert('Type DELETE to confirm');
      return;
    }
    if (!profile) return;

    Alert.alert(
      'CONFIRM DELETION',
      'Your account will be permanently deleted. Task history will be anonymised as "Former Comrade". This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const { error } = await supabase.functions.invoke('delete-account', {
                headers: { Authorization: `Bearer ${session?.access_token}` },
              });
              if (error) throw error;
              router.replace('/(auth)/sign-in');
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Deletion failed. Please try again.');
            }
          },
        },
      ]
    );
  }

  async function shareInviteLink() {
    if (!collective) return;
    const url = `https://socialcredit.app/join/${collective.code}`;
    const message = `Join my Collective on Social Credit! Code: ${collective.code} or tap: ${url}`;
    try {
      await Share.share({ message, url });
    } catch {
      await Clipboard.setStringAsync(message);
      Alert.alert('Copied!', 'Invite link copied to clipboard.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>SETTINGS</Text>
      <Text style={styles.headerSub}>Comrade {profile?.username}</Text>

      <Section title="ACCOUNT">
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <PropagandaButton
            title="Save"
            onPress={handleSaveUsername}
            loading={savingUsername}
            style={styles.saveBtn}
          />
        </View>
      </Section>

      {collective && (
        <Section title="COLLECTIVE">
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>COLLECTIVE CODE</Text>
            <Text style={styles.code}>{collective.code}</Text>
            <TouchableOpacity
              onPress={() => {
                Clipboard.setStringAsync(collective.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={styles.copyBtn}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={20}
                color={copied ? COLORS.success : COLORS.muted}
              />
            </TouchableOpacity>
          </View>

          <PropagandaButton
            title="Share Invite Link"
            onPress={shareInviteLink}
            variant="ghost"
            style={styles.actionBtn}
          />

          <SettingRow label="Holiday Pause">
            <Switch
              onValueChange={handleHolidayPause}
              value={isPaused}
              thumbColor={COLORS.accent}
              trackColor={{ true: COLORS.primary }}
            />
          </SettingRow>

          <TouchableOpacity style={styles.dangerRow} onPress={handleLeaveCollective}>
            <Text style={styles.dangerText}>Leave Collective</Text>
          </TouchableOpacity>
        </Section>
      )}

      <Section title="DATA & PRIVACY">
        <PropagandaButton
          title="Download My Data"
          onPress={handleDownloadData}
          variant="ghost"
          style={styles.actionBtn}
        />

        <TouchableOpacity onPress={() => setShowDeleteSection((v) => !v)}>
          <Text style={styles.dangerText}>Delete My Account</Text>
        </TouchableOpacity>

        {showDeleteSection && (
          <View style={styles.deleteBox}>
            <Text style={styles.deleteWarning}>
              Your email and login will be permanently deleted. Task history will be anonymised as "Former Comrade".
            </Text>
            <TextInput
              style={styles.deleteInput}
              placeholder='Type "DELETE" to confirm'
              placeholderTextColor={COLORS.muted}
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
            />
            <PropagandaButton
              title="Permanently Delete Account"
              onPress={handleDeleteAccount}
              style={[styles.actionBtn, { backgroundColor: COLORS.danger }]}
            />
          </View>
        )}
      </Section>

      {profile?.is_admin && <AdminSection />}

      {__DEV__ && collective && profile && (
        <DevSection
          collectiveId={collective.id}
          timezone={collective.timezone}
          onAssigned={() => fetchAssignments(collective.id, profile.id, collective.timezone)}
        />
      )}

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Defined outside the component so they are stable across renders
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

function AdminSection() {
  return (
    <View style={sectionStyles.container}>
      <Text style={[sectionStyles.title, { color: COLORS.danger }]}>ADMIN</Text>
      <Text style={{ color: COLORS.muted, fontSize: 13 }}>
        Admin controls are available. Use the Supabase dashboard for advanced operations.
      </Text>
    </View>
  );
}

function DevSection({
  collectiveId,
  timezone,
  onAssigned,
}: {
  collectiveId: string;
  timezone: string;
  onAssigned: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  async function handleForceAssign() {
    setLoading(true);
    setStatus('');
    try {
      const weekStart = collectiveWeekStart(timezone);

      const { error: delErr } = await supabase
        .from('weekly_assignments')
        .delete()
        .eq('collective_id', collectiveId)
        .eq('week_start', weekStart)
        .eq('status', 'pending');
      if (delErr) throw new Error(`Clear assignments: ${delErr.message}`);

      const { error: upsertErr } = await supabase
        .from('draft_state')
        .upsert(
          { collective_id: collectiveId, week_start: weekStart, status: 'pending' },
          { onConflict: 'collective_id,week_start' }
        );
      if (upsertErr) throw new Error(`Upsert draft_state: ${upsertErr.message}`);

      const { error: resetErr } = await supabase
        .from('draft_state')
        .update({ status: 'pending' })
        .eq('collective_id', collectiveId)
        .eq('week_start', weekStart);
      if (resetErr) throw new Error(`Reset draft_state: ${resetErr.message}`);

      const { error: fnErr } = await supabase.functions.invoke('auto-assign', {
        body: { force: true },
      });

      if (fnErr) {
        let detail = fnErr.message;
        if (fnErr.context) {
          try {
            const body = await (fnErr.context as Response).json();
            detail = body.error ?? JSON.stringify(body);
          } catch {
            try { detail = await (fnErr.context as Response).text(); } catch { /* keep fnErr.message */ }
          }
        }
        throw new Error(detail);
      }

      onAssigned();
      setStatus('Tasks assigned.');
    } catch (err: any) {
      setStatus(`Error: ${err.message ?? 'Failed.'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={sectionStyles.container}>
      <Text style={[sectionStyles.title, { color: '#FF6600' }]}>DEV</Text>
      <PropagandaButton
        title={loading ? 'Assigning...' : 'Force Assign Tasks'}
        onPress={handleForceAssign}
        loading={loading}
        style={{ marginBottom: 8 }}
      />
      {status !== '' && (
        <Text style={{ color: COLORS.muted, fontSize: 12, letterSpacing: 1 }}>{status}</Text>
      )}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { marginBottom: 28 },
  title: { color: COLORS.accent, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
});

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
  label: { color: COLORS.text, fontSize: 14 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingTop: 40, paddingBottom: 48 },
  headerTitle: { color: COLORS.primary, fontWeight: '900', letterSpacing: 3, fontSize: 26, marginBottom: 4 },
  headerSub: { color: COLORS.text, fontSize: 13, marginBottom: 28 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3D2020',
    padding: 12,
    fontSize: 15,
  },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  codeBox: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 4, alignItems: 'center', marginBottom: 12 },
  codeLabel: { color: COLORS.muted, fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  code: { color: COLORS.accent, fontSize: 32, fontFamily: 'SpaceMono', fontWeight: '700', letterSpacing: 8 },
  copyBtn: { marginTop: 8, padding: 4 },
  actionBtn: { marginBottom: 10 },
  dangerRow: { paddingVertical: 12 },
  dangerText: { color: COLORS.danger, fontSize: 14 },
  deleteBox: { marginTop: 12, gap: 12 },
  deleteWarning: { color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  deleteInput: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.danger,
    padding: 12,
    fontSize: 15,
  },
  signOutBtn: {
    marginTop: 16,
    padding: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.muted,
    alignItems: 'center',
  },
  signOutText: { color: COLORS.muted, fontWeight: '700', letterSpacing: 2 },
});
