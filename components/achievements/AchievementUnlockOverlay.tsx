import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { ACHIEVEMENTS_BY_KEY } from '../../constants/achievements';
import { COLORS } from '../../constants/theme';
import { haptics } from '../../lib/haptics';
import { useAchievementStore } from '../../store/useAchievementStore';

export function AchievementUnlockOverlay() {
  const newlyUnlocked = useAchievementStore((s) => s.pendingUnlocks);
  const clearUnlocked = useAchievementStore((s) => s.clearUnlocks);
  const [index, setIndex] = useState(0);

  // A rubber stamp hits the paper, not fades onto it: it drops in oversized
  // and rotated, then snaps to rest with a little overshoot. Ink (the stamp
  // text + star) only appears once the impact has landed.
  const impact = useRef(new Animated.Value(0)).current;
  const ink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (newlyUnlocked.length > 0) setIndex(0);
  }, [newlyUnlocked]);

  useEffect(() => {
    if (newlyUnlocked.length === 0) return;
    impact.setValue(0);
    ink.setValue(0);
    Animated.sequence([
      Animated.spring(impact, {
        toValue: 1,
        friction: 5,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(ink, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    haptics.success();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, newlyUnlocked.length]);

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

  const cardTransform = {
    transform: [
      { scale: impact.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
      { rotate: impact.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '0deg'] }) },
    ],
    opacity: impact,
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleDismiss}>
        <Animated.View style={[styles.card, cardTransform]}>
          <Animated.Text style={[styles.stamp, { opacity: ink }]}>ACHIEVEMENT UNLOCKED</Animated.Text>
          <Animated.Text style={[styles.star, { opacity: ink }]}>★</Animated.Text>
          <Animated.Text style={[styles.title, { opacity: ink }]}>{achievement.title}</Animated.Text>
          <Animated.Text style={[styles.category, { opacity: ink }]}>{achievement.category.toUpperCase()}</Animated.Text>
          <Animated.Text style={[styles.description, { opacity: ink }]}>{achievement.description}</Animated.Text>
          {newlyUnlocked.length > 1 && (
            <Animated.Text style={[styles.counter, { opacity: ink }]}>{index + 1} / {newlyUnlocked.length}</Animated.Text>
          )}
          <Animated.Text style={[styles.dismiss, { opacity: ink }]}>{isLast ? 'TAP TO CLOSE' : 'TAP FOR NEXT'}</Animated.Text>
        </Animated.View>
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
