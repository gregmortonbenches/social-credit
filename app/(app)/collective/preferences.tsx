import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCollectiveStore } from '../../../store/useCollectiveStore';

interface Task {
  id: string;
  name: string;
}

const ITEM_HEIGHT = 50;

// ─── Row components (memoised so only changed rows re-render during drag) ───

const RankedRow = React.memo(function RankedRow({
  task,
  index,
  isDragging,
  isDimmed,
  panHandlers,
  onRemove,
}: {
  task: Task;
  index: number;
  isDragging: boolean;
  isDimmed: boolean;
  panHandlers: object;
  onRemove: (id: string) => void;
}) {
  return (
    <View
      style={[
        styles.rankedRow,
        isDragging && styles.rankedRowActive,
        isDimmed && styles.rankedRowDimmed,
      ]}
      {...panHandlers}
    >
      <Text style={styles.rankBadge}>{index + 1}</Text>
      <View style={styles.dragHandle} pointerEvents="none">
        <View style={styles.dragLine} />
        <View style={styles.dragLine} />
        <View style={styles.dragLine} />
      </View>
      <Text style={styles.taskName}>{task.name}</Text>
      <TouchableOpacity onPress={() => onRemove(task.id)} style={styles.removeBtn}>
        <Text style={styles.removeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
});

const UnrankedRow = React.memo(function UnrankedRow({
  task,
  onAdd,
}: {
  task: Task;
  onAdd: (id: string) => void;
}) {
  return (
    <TouchableOpacity style={styles.unrankedRow} onPress={() => onAdd(task.id)}>
      <Text style={styles.taskName}>{task.name}</Text>
      <Text style={styles.addText}>+ RANK</Text>
    </TouchableOpacity>
  );
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PreferencesScreen() {
  const collective = useCollectiveStore((s) => s.collective);
  const { taskPreferences, loadPreferences, savePreferences } = useCollectiveStore();
  const profile = useAuthStore((s) => s.profile);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [rankedIds, setRankedIds] = useState<string[]>([]);
  const [unranked, setUnranked] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [displayedRankedIds, setDisplayedRankedIds] = useState<string[]>([]);

  // Refs so PanResponder closures always see latest values without being recreated.
  const displayedRef = useRef<string[]>([]);
  const rankedRef = useRef<string[]>([]);
  const dragRef = useRef<{ taskId: string; originalIndex: number; currentIndex: number } | null>(null);

  useEffect(() => { displayedRef.current = displayedRankedIds; }, [displayedRankedIds]);
  useEffect(() => { rankedRef.current = rankedIds; }, [rankedIds]);

  useEffect(() => {
    if (!collective || !profile) return;
    loadData();
  }, [collective?.id, profile?.id]);

  async function loadData() {
    if (!collective || !profile) return;
    setLoading(true);
    const [{ data: taskData }] = await Promise.all([
      supabase
        .from('task_library')
        .select('id, name')
        .or(`is_custom.eq.false,created_by_collective_id.eq.${collective.id}`)
        .order('name'),
      loadPreferences(collective.id, profile.id),
    ]);
    setTasks(taskData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (tasks.length === 0) return;
    const sorted = [...taskPreferences].sort((a, b) => a.rank - b.rank);
    const seenDupes = new Set<string>();
    const ranked = sorted
      .map((p) => tasks.find((t) => t.id === p.task_id))
      .filter((t): t is Task => {
        if (!t || seenDupes.has(t.id)) return false;
        seenDupes.add(t.id);
        return true;
      });

    let ids: string[];
    let rest: Task[];

    if (ranked.length === 0) {
      ids = [...new Set(tasks.map((t) => t.id))];
      rest = [];
    } else {
      const seen = new Set(ranked.map((t) => t.id));
      ids = ranked.map((t) => t.id);
      rest = tasks.filter((t) => !seen.has(t.id));
    }

    setRankedIds(ids);
    setDisplayedRankedIds(ids);
    setUnranked(rest);
  }, [taskPreferences, tasks]);

  // O(1) task lookup — rebuilt only when tasks list changes.
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // PanResponders are keyed by taskId and only recreated when the task list
  // changes. They read current positions from refs so they don't need to
  // close over rankedIds (which changes after every drag release).
  const panResponders = useMemo(() => {
    const map: Record<string, ReturnType<typeof PanResponder.create>> = {};
    tasks.forEach(({ id: taskId }) => {
      let grantDy = 0;
      map[taskId] = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dy) > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
        onPanResponderGrant: (_, gs) => {
          grantDy = gs.dy;
          const originalIndex = rankedRef.current.indexOf(taskId);
          dragRef.current = { taskId, originalIndex, currentIndex: originalIndex };
          setDraggingId(taskId);
          setDisplayedRankedIds([...rankedRef.current]);
        },
        onPanResponderMove: (_, gs) => {
          const drag = dragRef.current;
          if (!drag || drag.taskId !== taskId) return;
          const target = Math.max(
            0,
            Math.min(
              displayedRef.current.length - 1,
              drag.originalIndex + Math.round((gs.dy - grantDy) / ITEM_HEIGHT)
            )
          );
          if (target !== drag.currentIndex) {
            const next = [...displayedRef.current];
            next.splice(drag.currentIndex, 1);
            next.splice(target, 0, taskId);
            setDisplayedRankedIds(next);
            drag.currentIndex = target;
          }
        },
        onPanResponderRelease: () => {
          const final = [...displayedRef.current];
          setRankedIds(final);
          setDraggingId(null);
          dragRef.current = null;
        },
      });
    });
    return map;
  }, [tasks]); // Never recreated mid-drag or after drag release

  const removeFromRanked = useCallback((taskId: string) => {
    setRankedIds((prev) => prev.filter((id) => id !== taskId));
    setDisplayedRankedIds((prev) => prev.filter((id) => id !== taskId));
    const task = taskMap.get(taskId);
    if (task) setUnranked((prev) => [...prev, task].sort((a, b) => a.name.localeCompare(b.name)));
  }, [taskMap]);

  const addToRanked = useCallback((taskId: string) => {
    setRankedIds((prev) => [...prev, taskId]);
    setDisplayedRankedIds((prev) => [...prev, taskId]);
    setUnranked((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  async function handleSave() {
    if (!collective || !profile) return;
    setSaving(true);
    try {
      await savePreferences(collective.id, profile.id, rankedIds);
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  }

  const displayedTasks = useMemo(() => {
    const activeIds = draggingId ? displayedRankedIds : rankedIds;
    return [...new Set(activeIds)]
      .map((id) => taskMap.get(id))
      .filter((t): t is Task => t !== undefined);
  }, [draggingId, displayedRankedIds, rankedIds, taskMap]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!draggingId}>
        <Text style={styles.title}>TASK PREFERENCES</Text>
        <Text style={styles.subtitle}>
          Use people according to their abilities.
        </Text>

        {displayedTasks.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RANKED PREFERENCES</Text>
            <Text style={styles.hint}>Hold and drag the handle to reorder.</Text>
            {displayedTasks.map((task, i) => (
              <RankedRow
                key={task.id}
                task={task}
                index={i}
                isDragging={draggingId === task.id}
                isDimmed={draggingId !== null && draggingId !== task.id}
                panHandlers={panResponders[task.id]?.panHandlers ?? {}}
                onRemove={removeFromRanked}
              />
            ))}
          </>
        )}

        {unranked.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              {displayedTasks.length === 0 ? 'TAP TO RANK' : 'UNRANKED — TAP TO ADD'}
            </Text>
            <Text style={styles.hint}>Unranked tasks are assigned last, in rotation.</Text>
            {unranked.map((task) => (
              <UnrankedRow key={task.id} task={task} onAdd={addToRanked} />
            ))}
          </>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'SAVING...' : 'SAVE PREFERENCES'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  title: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 3,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 24,
  },
  sectionLabel: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
    marginTop: 16,
  },
  hint: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
    gap: 10,
  },
  rankedRowActive: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 10,
    transform: [{ scale: 1.03 }],
    zIndex: 999,
  },
  rankedRowDimmed: {
    opacity: 0.45,
  },
  dragHandle: {
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  dragLine: {
    width: 16,
    height: 2,
    backgroundColor: COLORS.muted,
    borderRadius: 1,
  },
  rankBadge: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  taskName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
  },
  removeBtn: {
    padding: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.muted,
  },
  removeText: { color: COLORS.muted, fontSize: 12 },
  unrankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  addText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
    borderRadius: 0,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 2, fontSize: 14 },
  cancelBtn: {
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 0,
  },
  cancelText: { color: COLORS.primary, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
});
