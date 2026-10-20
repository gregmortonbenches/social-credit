import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PropagandaButton } from '../../../components/ui/PropagandaButton';
import { DraftTask, TaskBuilder } from '../../../components/collective/TaskBuilder';
import { PropagandaInput } from '../../../components/ui/PropagandaInput';
import { CONFIG } from '../../../constants/config';
import { COLORS } from '../../../constants/theme';
import { addCollectiveTasks } from '../../../lib/taskLibrary';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCollectiveStore } from '../../../store/useCollectiveStore';

export default function CreateCollectiveScreen() {
  const profile = useAuthStore((s) => s.profile);
  const createCollective = useCollectiveStore((s) => s.createCollective);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [createdCode, setCreatedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nameValid = name.trim().length > 0 && name.trim().length <= CONFIG.COLLECTIVE_NAME_MAX_CHARS;

  async function handleCreate() {
    if (tasks.length < 1) { setError('Add at least 1 duty to the Collective'); return; }
    if (!profile) { setError('Profile not loaded. Please close and reopen the app.'); return; }
    setLoading(true);
    setError('');
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await createCollective(name.trim(), timezone, {}, profile.id);
      const created = useCollectiveStore.getState().collective;
      if (created) {
        try {
          await addCollectiveTasks(created.id, tasks);
        } catch {
          // The Collective exists now; don't strand the founder on this step.
          // Duties can be added from the Collective page.
        }
      }
      // Reveal the join code before entering the app. It is the only way to get
      // housemates in, and it was previously never shown at the moment it is
      // needed — the founder had to go digging in Settings to find it.
      const code = useCollectiveStore.getState().collective?.code ?? '';
      setCreatedCode(code);
      setStep(3);
    } catch (err: any) {
      setError(err.message ?? 'Failed to establish Collective');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>ESTABLISH COLLECTIVE</Text>

        {step === 1 && (
          <>
            <Text style={styles.label}>COLLECTIVE NAME</Text>
            <PropagandaInput
              label="Name"
              value={name}
              onChangeText={setName}
              maxLength={CONFIG.COLLECTIVE_NAME_MAX_CHARS}
              placeholder="e.g. The People's Kitchen"
            />
            {name.trim().length > 0 && (
              <Text style={styles.preview}>
                Preview: <Text style={styles.previewName}>{name.trim()} Collective</Text>
              </Text>
            )}
            <Text style={styles.charCount}>
              {name.trim().length}/{CONFIG.COLLECTIVE_NAME_MAX_CHARS}
            </Text>
            <PropagandaButton
              title="Proceed to Duties"
              onPress={() => setStep(2)}
              disabled={!nameValid}
              style={styles.btn}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.sectionHeader}>SET THE DUTIES</Text>
            <Text style={styles.hint}>
              Pick an action and name the space. Any Comrade can add more later.
            </Text>
            <TaskBuilder
              tasks={tasks}
              onAdd={(action, space) =>
                setTasks((prev) => [...prev, { key: `${action}:${space}:${prev.length}`, action, space }])
              }
              onRemove={(key) => setTasks((prev) => prev.filter((t) => t.key !== key))}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PropagandaButton
              title="Establish the Collective!"
              onPress={handleCreate}
              loading={loading}
              disabled={tasks.length < 1}
              style={styles.btn}
            />
            <TouchableOpacity onPress={() => setStep(1)}>
              <Text style={styles.back}>‹ Back</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.successHeader}>COLLECTIVE ESTABLISHED</Text>
            <Text style={styles.hint}>
              Share this code with your household, Comrade. It is the only way in.
            </Text>

            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>JOIN CODE</Text>
              <Text style={styles.codeValue}>{createdCode}</Text>
            </View>

            <PropagandaButton
              title={copied ? 'Copied!' : 'Copy Code'}
              variant="ghost"
              onPress={async () => {
                await Clipboard.setStringAsync(createdCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={styles.codeBtn}
            />
            <PropagandaButton
              title="Share Invite"
              onPress={() =>
                Share.share({
                  message: `Join my Collective on Social Credit! Code: ${createdCode}`,
                })
              }
              style={styles.codeBtn}
            />

            <Text style={styles.codeFootnote}>
              You can find this again under Collective Settings.
            </Text>

            <PropagandaButton
              title="Enter the Collective"
              variant="secondary"
              onPress={() => router.replace('/(app)')}
              style={styles.btn}
            />
          </>
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
  label: { color: COLORS.muted, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  preview: { color: COLORS.muted, fontSize: 13, marginBottom: 4 },
  previewName: { color: COLORS.accent, fontWeight: '700' },
  charCount: { color: COLORS.muted, fontSize: 11, textAlign: 'right', marginBottom: 16 },
  sectionHeader: { color: COLORS.accent, fontSize: 14, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  hint: { color: COLORS.muted, fontSize: 13, marginBottom: 20 },
  errorText: { color: COLORS.danger, fontSize: 13, marginBottom: 12 },
  successHeader: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: 'center',
  },
  codeBox: {
    borderWidth: 3,
    borderColor: COLORS.primary,
    paddingVertical: 24,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  codeLabel: { color: COLORS.muted, fontSize: 11, letterSpacing: 3, fontWeight: '700', marginBottom: 8 },
  codeValue: {
    color: COLORS.primary,
    fontFamily: 'SpaceMono',
    fontSize: 44,
    letterSpacing: 10,
    fontWeight: '700',
  },
  codeBtn: { marginBottom: 10 },
  codeFootnote: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  btn: { marginTop: 24, marginBottom: 12 },
  back: { color: COLORS.accent, textAlign: 'center', fontSize: 14 },
});
