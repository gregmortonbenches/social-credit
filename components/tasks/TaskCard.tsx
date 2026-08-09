import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { avatarColor, COLORS } from '../../constants/theme';
import type { WeeklyAssignment } from '../../lib/database.types';
import { useTaskStore } from '../../store/useTaskStore';

interface Props {
  assignment: WeeklyAssignment;
  taskName: string;
  iconName?: string;
  readOnly?: boolean;
}

export function TaskCard({ assignment, taskName, iconName, readOnly }: Props) {
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);

  const isOverdue = new Date(assignment.due_date) < new Date() && assignment.status === 'pending';
  const isDone = assignment.status === 'complete';
  const color = avatarColor(assignment.user_id);

  // Stamp springs in; initialise at 1 for tasks already done on load
  const stampScale = useRef(new Animated.Value(isDone ? 1 : 0)).current;

  // Float: two separate values so initial opacity is unambiguously 0
  const creditY = useRef(new Animated.Value(0)).current;
  const creditOpacity = useRef(new Animated.Value(0)).current;

  // Guards against double-submit. The ref is the real lock — setState is async,
  // so a fast second tap can land before a re-render disables the control. The
  // state exists only to grey the control out.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  async function handleComplete() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await completeTask(assignment.id);

      // Stamp slam
      stampScale.setValue(0);
      Animated.spring(stampScale, {
        toValue: 1,
        friction: 3,
        tension: 120,
        useNativeDriver: true,
      }).start();

      // Credit float — reset then animate
      creditY.setValue(0);
      creditOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(creditY, {
          toValue: -56,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(creditOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } catch {
      Alert.alert('Error', 'Could not complete task. Please try again, Comrade.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function handleUndo() {
    Alert.alert(
      'Undo completion?',
      `Mark "${taskName}" as incomplete again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            try {
              await uncompleteTask(assignment.id);
              stampScale.setValue(0);
            } catch {
              Alert.alert('Error', 'Could not undo completion. Please try again, Comrade.');
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.row, isOverdue && styles.rowOverdue, isDone && styles.rowDone]}>
      <Ionicons
        name={(iconName ?? 'checkmark-circle-outline') as any}
        size={28}
        color={isOverdue ? COLORS.danger : isDone ? COLORS.muted : COLORS.text}
        style={styles.icon}
      />

      <Text style={[
        styles.taskName,
        isDone && styles.taskNameDone,
        isOverdue && styles.taskNameOverdue,
      ]}>
        {taskName}
      </Text>

      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Ionicons name="person" size={16} color="#FFFFFF" />
      </View>

      <View style={styles.stampWrap}>
        {isDone ? (
          <TouchableOpacity
            onPress={handleUndo}
            disabled={readOnly || busy}
            accessibilityRole="button"
            accessibilityLabel={`Undo completion of ${taskName}`}
          >
            <Animated.View style={[styles.stamp, { transform: [{ scale: stampScale }] }]}>
              <Text style={styles.stampChar}>完</Text>
            </Animated.View>
          </TouchableOpacity>
        ) : !readOnly ? (
          <TouchableOpacity
            style={[styles.checkbox, busy && styles.checkboxBusy]}
            onPress={handleComplete}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${taskName} complete`}
            accessibilityState={{ disabled: busy }}
          />
        ) : (
          <View style={styles.checkbox} />
        )}

        <Animated.Text
          style={[styles.creditFloat, { opacity: creditOpacity, transform: [{ translateY: creditY }] }]}
          pointerEvents="none"
        >
          +{assignment.credits_value ?? '?'}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
    gap: 12,
  },
  rowOverdue: { borderLeftWidth: 3, borderLeftColor: COLORS.danger, paddingLeft: 8 },
  rowDone: { opacity: 0.55 },
  icon: { width: 32 },
  taskName: { flex: 1, fontSize: 17, color: COLORS.text, fontWeight: '500' },
  taskNameDone: { textDecorationLine: 'line-through' },
  taskNameOverdue: { color: COLORS.danger },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    width: 34,
    height: 34,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  stampChar: { color: COLORS.primary, fontSize: 15, fontWeight: '900' },
  checkbox: {
    width: 30,
    height: 30,
    borderWidth: 2,
    borderColor: COLORS.muted,
  },
  checkboxBusy: { opacity: 0.4 },
  creditFloat: {
    position: 'absolute',
    bottom: 40,
    width: 60,
    left: -12,
    textAlign: 'center',
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'SpaceMono',
  },
});
