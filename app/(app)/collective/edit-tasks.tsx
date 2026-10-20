import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { DraftTask, TaskBuilder } from '../../../components/collective/TaskBuilder';
import { COLORS } from '../../../constants/theme';
import { addCollectiveTasks, archiveCollectiveTask, fetchCollectiveTasks } from '../../../lib/taskLibrary';
import { useCollectiveStore } from '../../../store/useCollectiveStore';

export default function EditTasksScreen() {
  const collective = useCollectiveStore((s) => s.collective);
  const [tasks, setTasks] = useState<DraftTask[]>([]);

  const load = useCallback(async () => {
    if (!collective) return;
    try {
      const rows = await fetchCollectiveTasks(collective.id);
      setTasks(rows.map((r) => ({ key: r.id, action: r.action ?? 'clean', space: r.space ?? r.name })));
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not load duties');
    }
  }, [collective?.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(action: string, space: string) {
    if (!collective) return;
    await addCollectiveTasks(collective.id, [{ action, space }]);
    await load();
  }

  async function handleRemove(id: string) {
    try {
      await archiveCollectiveTask(id);
      await load();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not remove the duty');
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>EDIT DUTIES</Text>
        <Text style={styles.hint}>
          Any Comrade may add or remove a duty. New duties are handed out at the next assignment; removed ones stay
          with whoever already holds them this week.
        </Text>
        <TaskBuilder tasks={tasks} onAdd={handleAdd} onRemove={handleRemove} />
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Done</Text>
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
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 8,
    textAlign: 'center',
  },
  hint: { color: COLORS.muted, fontSize: 13, marginBottom: 24, textAlign: 'center' },
  back: { color: COLORS.accent, textAlign: 'center', fontSize: 14, marginTop: 28 },
});
