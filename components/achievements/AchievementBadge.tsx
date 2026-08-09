import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';

interface Props {
  title: string;
  unlocked: boolean;
  category: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  cleaning: COLORS.primary,
  longevity: '#2980B9',
  interaction: COLORS.accent,
  collective: COLORS.success,
};

export function AchievementBadge({ title, unlocked, category }: Props) {
  const borderColor = unlocked ? (CATEGORY_COLORS[category] ?? COLORS.muted) : '#3D2020';

  return (
    <View style={[styles.badge, { borderColor }]}>
      {unlocked ? (
        <>
          <Text style={[styles.star, { color: CATEGORY_COLORS[category] ?? COLORS.muted }]}>★</Text>
          <Text style={[styles.title, { color: CATEGORY_COLORS[category] ?? COLORS.text }]} numberOfLines={2}>
            {title}
          </Text>
        </>
      ) : (
        <View style={styles.locked}>
          <Text style={styles.lockedStar}>?</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 90,
    height: 90,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    backgroundColor: COLORS.surface,
  },
  star: { fontSize: 20, marginBottom: 2 },
  title: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center', lineHeight: 12 },
  locked: { alignItems: 'center', justifyContent: 'center', opacity: 0.3 },
  lockedStar: { fontSize: 28, color: COLORS.muted, fontWeight: '700' },
});
