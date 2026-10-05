import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../../constants/theme';
import { haptics } from '../../../lib/haptics';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCollectiveStore } from '../../../store/useCollectiveStore';

interface Task {
  id: string;
  name: string;
}

// Fixed, so the drag maths and the layout agree. Row height plus its bottom
// margin is how far one slot is from the next.
const ROW_HEIGHT = 56;
const ROW_GAP = 6;
const STEP = ROW_HEIGHT + ROW_GAP;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ─── Row components (memoised so only changed rows re-render during drag) ───

const RankedRow = React.memo(function RankedRow({
  task,
  index,
  isDragging,
  isDimmed,
  translateY,
  panHandlers,
  onRemove,
}: {
  task: Task;
  index: number;
  isDragging: boolean;
  isDimmed: boolean;
  translateY: Animated.Value;
  panHandlers: object;
  onRemove: (id: string) => void;
}) {
  return (
    <Animated.View
      style={[
        styles.rankedRow,
        isDragging && styles.rankedRowActive,
        isDimmed && styles.rankedRowDimmed,
        { transform: [{ translateY }, { scale: isDragging ? 1.03 : 1 }] },
      ]}
    >
      {/* The handle is the only grab area, and it is wide: the old drag started
          from anywhere on the row, after a 5px threshold, and fought the scroll. */}
      <View style={styles.grabArea} {...panHandlers}>
        <Text style={styles.rankBadge}>{index + 1}</Text>
        <View style={styles.dragHandle} pointerEvents="none">
          <View style={styles.dragLine} />
          <View style={styles.dragLine} />
          <View style={styles.dragLine} />
        </View>
      </View>
      <Text style={styles.taskName}>{task.name}</Text>
      <TouchableOpacity onPress={() => onRemove(task.id)} style={styles.removeBtn}>
        <Text style={styles.removeText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
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

  // Refs so PanResponder closures always see latest values without being recreated.
  const rankedRef = useRef<string[]>([]);
  const dragRef = useRef<{ taskId: string; originalIndex: number; target: number } | null>(null);

  // The dragged row follows the finger through `dragY`; every other row slides
  // by `shifts[id]` to open a gap at the slot the dragged row is hovering over.
  // These are Animated values rather than state, so a drag does not re-render.
  const dragY = useRef(new Animated.Value(0)).current;
  const shifts = useRef<Record<string, Animated.Value>>({}).current;
  const getShift = (id: string) => (shifts[id] ??= new Animated.Value(0));

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
    setUnranked(rest);
  }, [taskPreferences, tasks]);

  // O(1) task lookup — rebuilt only when tasks list changes.
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // PanResponders are keyed by taskId and only recreated when the task list
  // changes. They read current positions from refs so they don't need to
  // close over rankedIds (which changes after every drag release).
  const panResponders = useMemo(() => {
    const finish = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      // Settle into the slot, then commit the new order and clear every offset
      // in the same tick so the rows do not flicker.
      Animated.timing(dragY, {
        toValue: (drag.target - drag.originalIndex) * STEP,
        duration: 100,
        useNativeDriver: true,
      }).start(() => {
        const next = [...rankedRef.current];
        next.splice(drag.originalIndex, 1);
        next.splice(drag.target, 0, drag.taskId);
        rankedRef.current = next;
        setRankedIds(next);
        Object.values(shifts).forEach((v) => v.setValue(0));
        dragY.setValue(0);
        setDraggingId(null);
      });
    };

    const map: Record<string, ReturnType<typeof PanResponder.create>> = {};
    tasks.forEach(({ id: taskId }) => {
      map[taskId] = PanResponder.create({
        // Grab immediately on touching the handle, and refuse to give the touch
        // up to the ScrollView mid-drag.
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const index = rankedRef.current.indexOf(taskId);
          if (index < 0) return;
          dragRef.current = { taskId, originalIndex: index, target: index };
          dragY.setValue(0);
          setDraggingId(taskId);
          haptics.grab();
        },
        onPanResponderMove: (_, gs) => {
          const drag = dragRef.current;
          if (!drag || drag.taskId !== taskId) return;
          const last = rankedRef.current.length - 1;
          const y = clamp(gs.dy, -drag.originalIndex * STEP, (last - drag.originalIndex) * STEP);
          dragY.setValue(y);

          const target = clamp(Math.round(drag.originalIndex + y / STEP), 0, last);
          if (target === drag.target) return;
          drag.target = target;
          haptics.tick();
          rankedRef.current.forEach((id, i) => {
            if (id === taskId) return;
            const to =
              i > drag.originalIndex && i <= target ? -STEP :
              i < drag.originalIndex && i >= target ? STEP : 0;
            Animated.timing(getShift(id), { toValue: to, duration: 120, useNativeDriver: true }).start();
          });
        },
        onPanResponderRelease: finish,
        onPanResponderTerminate: finish,
      });
    });
    return map;
  }, [tasks]); // Never recreated mid-drag or after drag release

  const removeFromRanked = useCallback((taskId: string) => {
    haptics.tap();
    setRankedIds((prev) => prev.filter((id) => id !== taskId));
    const task = taskMap.get(taskId);
    if (task) setUnranked((prev) => [...prev, task].sort((a, b) => a.name.localeCompare(b.name)));
  }, [taskMap]);

  const addToRanked = useCallback((taskId: string) => {
    haptics.tap();
    // Top of the list: what you just chose to rank is what you care about now.
    setRankedIds((prev) => [taskId, ...prev]);
    setUnranked((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  async function handleSave() {
    if (!collective || !profile) return;
    setSaving(true);
    try {
      await savePreferences(collective.id, profile.id, rankedIds);
      haptics.success();
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  }

  const displayedTasks = useMemo(() => {
    return [...new Set(rankedIds)]
      .map((id) => taskMap.get(id))
      .filter((t): t is Task => t !== undefined);
  }, [rankedIds, taskMap]);

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
        {/* Ranking is the most effortful thing a member does here, and nothing
            said what it buys them. */}
        <Text style={styles.explainer}>
          Duties are assigned every Sunday. Whoever earned the most credits last
          week picks first, and each Comrade receives their highest-ranked task
          still unclaimed. Your picks are then marked on your task cards.
        </Text>

        {displayedTasks.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RANKED PREFERENCES</Text>
            <Text style={styles.hint}>Drag the handle to reorder.</Text>
            {displayedTasks.map((task, i) => (
              <RankedRow
                key={task.id}
                task={task}
                index={i}
                isDragging={draggingId === task.id}
                isDimmed={draggingId !== null && draggingId !== task.id}
                translateY={draggingId === task.id ? dragY : getShift(task.id)}
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
  explainer: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: COLORS.surface,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    padding: 12,
    marginBottom: 16,
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
    height: ROW_HEIGHT,
    paddingHorizontal: 12,
    marginBottom: ROW_GAP,
    gap: 10,
  },
  grabArea: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    paddingRight: 8,
    marginLeft: -12,
    paddingLeft: 12,
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
