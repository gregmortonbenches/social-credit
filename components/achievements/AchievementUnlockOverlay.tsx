import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ACHIEVEMENTS_BY_KEY } from '../../constants/achievements';
import { COLORS } from '../../constants/theme';
import { useAchievementStore } from '../../store/useAchievementStore';

export function AchievementUnlockOverlay() {
  const newlyUnlocked = useAchievementStore((s) => s.pendingUnlocks);
  const clearUnlocked = useAchievementStore((s) => s.clearUnlocks);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (newlyUnlocked.length > 0) setIndex(0);
  }, [newlyUnlocked]);

  if (newlyUnlocked.length === 0) return null;

  const achievement = ACHIEVEMENTS_BY_KEY[newlyUnlocked[index]];
  if (!achievement) return null;

  const isLast = index >= newlyUnlocked.length - 1;

  function handleDismiss() {
    if (isLast) {
      clearUnlocked();
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleDismiss}>
        <View style={styles.card}>
          <Text style={styles.stamp}>ACHIEVEMENT UNLOCKED</Text>
          <Text style={styles.star}>★</Text>
          <Text style={styles.title}>{achievement.title}</Text>
          <Text style={styles.category}>{achievement.category.toUpperCase()}</Text>
          <Text style={styles.description}>{achievement.description}</Text>
          {newlyUnlocked.length > 1 && (
            <Text style={styles.counter}>{index + 1} / {newlyUnlocked.length}</Text>
          )}
          <Text style={styles.dismiss}>{isLast ? 'TAP TO CLOSE' : 'TAP FOR NEXT'}</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.primary,
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
  stamp: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 16,
  },
  star: {
    fontSize: 48,
    color: COLORS.primary,
    marginBottom: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 6,
  },
  category: {
    color: COLORS.muted,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 16,
  },
  description: {
    color: COLORS.text,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  counter: {
    color: COLORS.muted,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 16,
  },
  dismiss: {
    color: COLORS.muted,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 20,
  },
});
