import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getActionLabel,
  normaliseSpace,
  SPACE_MAX_CHARS,
  TASK_ACTIONS,
  type TaskAction,
} from '../../constants/tasks';
import { COLORS } from '../../constants/theme';
import { haptics } from '../../lib/haptics';
import { PropagandaButton } from '../ui/PropagandaButton';
import { PropagandaInput } from '../ui/PropagandaInput';

export interface DraftTask {
  key: string;
  action: string;
  space: string;
}

interface Props {
  tasks: DraftTask[];
  onAdd: (action: TaskAction, space: string) => Promise<void> | void;
  onRemove: (key: string) => Promise<void> | void;
}

/** Pick an action, type a space, add. Shared by Establish Collective and Edit Tasks. */
export function TaskBuilder({ tasks, onAdd, onRemove }: Props) {
  const [action, setAction] = useState<TaskAction>('clean');
  const [space, setSpace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cleaned = normaliseSpace(space);
  const duplicate = tasks.some(
    (t) => t.action === action && t.space.toLowerCase() === cleaned.toLowerCase(),
  );

  async function handleAdd() {
    if (!cleaned) return;
    if (duplicate) { setError('That duty already exists, Comrade.'); return; }
    setBusy(true);
    setError('');
    try {
      await onAdd(action, cleaned);
      haptics.tap();
      setSpace('');
    } catch (err: any) {
      setError(err.message ?? 'Could not add the duty');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.label}>ACTION</Text>
      <View style={styles.chips}>
        {TASK_ACTIONS.map((a) => {
          const selected = a.key === action;
          return (
            <TouchableOpacity
              key={a.key}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => { setAction(a.key); setError(''); }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{a.label.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <PropagandaInput
        label="Space"
        value={space}
        onChangeText={(v) => { setSpace(v); setError(''); }}
        maxLength={SPACE_MAX_CHARS}
        placeholder="e.g. Kitchen, Back garden, Hannah's room"
        returnKeyType="done"
        onSubmitEditing={handleAdd}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PropagandaButton
        title={cleaned ? `Add: ${getActionLabel(action)} ${cleaned}` : 'Add Duty'}
        variant="secondary"
        onPress={handleAdd}
        loading={busy}
        disabled={!cleaned}
        style={styles.addBtn}
      />

      <Text style={styles.label}>DUTIES ({tasks.length})</Text>
      {tasks.length === 0 ? (
        <Text style={styles.empty}>No duties yet. A Collective without duties is merely a flat.</Text>
      ) : (
        tasks.map((t) => (
          <View key={t.key} style={styles.row}>
            <Text style={styles.rowAction}>{getActionLabel(t.action).toUpperCase()}</Text>
            <Text style={styles.rowSpace} numberOfLines={1}>{t.space}</Text>
            <TouchableOpacity
              onPress={() => onRemove(t.key)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${getActionLabel(t.action)} ${t.space}`}
            >
              <Text style={styles.remove}>✕</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: COLORS.muted, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 0,
    backgroundColor: COLORS.surface,
  },
  chipSelected: { backgroundColor: COLORS.primary },
  chipText: { color: COLORS.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  chipTextSelected: { color: '#FFFFFF' },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 8 },
  addBtn: { marginTop: 8, marginBottom: 20 },
  empty: { color: COLORS.muted, fontSize: 13, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.muted,
    gap: 12,
  },
  rowAction: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1, width: 72 },
  rowSpace: { color: COLORS.text, fontSize: 16, flex: 1 },
  remove: { color: COLORS.muted, fontSize: 18, fontWeight: '700' },
});
