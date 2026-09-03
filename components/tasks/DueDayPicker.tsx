import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { collectiveDayKey } from '../../lib/draft';
import type { WeeklyAssignment } from '../../lib/database.types';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** The seven yyyy-MM-dd day keys of the week beginning `weekStart` (a Monday). */
function weekDays(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + i);
    return dt.toISOString().split('T')[0];
  });
}

interface Props {
  visible: boolean;
  taskName: string;
  assignment: WeeklyAssignment;
  /** All of this member's assignments, to show what each day already holds. */
  myAssignments: WeeklyAssignment[];
  timezone: string;
  onClose: () => void;
  onPick: (day: string) => void;
}

/**
 * Lets a member choose which day they will do a task.
 *
 * auto-assign spreads a member's tasks across the week as a default; this is how
 * they rearrange it. Stacking several tasks on one day is deliberately allowed —
 * clearing a backlog on a Saturday is a normal way to use this — so each day
 * shows what it already holds rather than blocking the choice.
 *
 * Days are bounded to the assignment's own week, matching the RPC, because a
 * task dated past the Monday reset would never be settled.
 */
export function DueDayPicker({
  visible,
  taskName,
  assignment,
  myAssignments,
  timezone,
  onClose,
  onPick,
}: Props) {
  const days = weekDays(assignment.week_start);
  const currentDay = collectiveDayKey(new Date(assignment.due_date), timezone);
  const todayKey = collectiveDayKey(new Date(), timezone);

  const countsByDay: Record<string, number> = {};
  for (const a of myAssignments) {
    if (a.id === assignment.id || a.status !== 'pending') continue;
    const key = collectiveDayKey(new Date(a.due_date), timezone);
    countsByDay[key] = (countsByDay[key] ?? 0) + 1;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>WHEN WILL YOU DO IT?</Text>
          <Text style={styles.subtitle}>{taskName}</Text>

          {days.map((day, i) => {
            const isCurrent = day === currentDay;
            const isPast = day < todayKey;
            const held = countsByDay[day] ?? 0;
            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayRow, isCurrent && styles.dayRowCurrent]}
                onPress={() => onPick(day)}
                disabled={isPast}
                accessibilityRole="button"
                accessibilityLabel={
                  `${WEEKDAYS[i]} ${day}` +
                  (isCurrent ? ', currently scheduled' : '') +
                  (held > 0 ? `, ${held} other task${held === 1 ? '' : 's'} that day` : '') +
                  (isPast ? ', in the past' : '')
                }
                accessibilityState={{ selected: isCurrent, disabled: isPast }}
              >
                <Text style={[styles.dayName, isPast && styles.dayPast, isCurrent && styles.dayNameCurrent]}>
                  {WEEKDAYS[i]}
                </Text>
                <Text style={[styles.dayMeta, isPast && styles.dayPast]}>
                  {held > 0 ? `${held} already` : ''}
                </Text>
                {isCurrent ? <Text style={styles.currentMark}>NOW</Text> : null}
              </TouchableOpacity>
            );
          })}

          <Text style={styles.footnote}>
            Everything is due by 23:59 on the day you choose. Several duties on one
            day is permitted, Comrade.
          </Text>

          <TouchableOpacity
            style={styles.cancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: COLORS.background,
    padding: 24,
    borderTopWidth: 3,
    borderTopColor: COLORS.primary,
  },
  title: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
    gap: 12,
  },
  dayRowCurrent: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  dayName: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700', letterSpacing: 2 },
  dayNameCurrent: { color: COLORS.primary },
  dayMeta: { color: COLORS.muted, fontSize: 12, fontFamily: 'SpaceMono' },
  dayPast: { opacity: 0.4 },
  currentMark: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  footnote: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
    marginBottom: 16,
  },
  cancel: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: COLORS.primary, fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});
