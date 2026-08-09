import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AchievementBadge } from '../../components/achievements/AchievementBadge';
import { ACHIEVEMENTS, type Achievement } from '../../constants/achievements';
import { COLORS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'cleaning', label: 'CLEANING' },
  { key: 'longevity', label: 'LONGEVITY' },
  { key: 'interaction', label: 'INTERACTION' },
  { key: 'collective', label: 'COLLECTIVE' },
];

export default function AchievementsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [unlockedKeys, setUnlockedKeys] = useState<Set<string>>(new Set());
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('achievements')
      .select('achievement_key')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) setUnlockedKeys(new Set(data.map((a) => a.achievement_key)));
      });
  }, [profile]);

  function handlePress(achievement: Achievement) {
    if (unlockedKeys.has(achievement.key)) {
      setSelectedAchievement(achievement);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ACHIEVEMENTS</Text>
        <Text style={styles.subtitle}>
          {unlockedKeys.size} / {ACHIEVEMENTS.length} unlocked
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {CATEGORIES.map(({ key, label }) => {
          const categoryAchievements = ACHIEVEMENTS.filter((a) => a.category === key);
          return (
            <View key={key} style={styles.section}>
              <Text style={styles.categoryLabel}>{label}</Text>
              <View style={styles.grid}>
                {categoryAchievements.map((achievement) => (
                  <TouchableOpacity
                    key={achievement.key}
                    onPress={() => handlePress(achievement)}
                    activeOpacity={unlockedKeys.has(achievement.key) ? 0.7 : 1}
                  >
                    <AchievementBadge
                      title={achievement.title}
                      unlocked={unlockedKeys.has(achievement.key)}
                      category={achievement.category}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={selectedAchievement !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAchievement(null)}
      >
        {selectedAchievement && (
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectedAchievement(null)}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalStar}>★</Text>
              <Text style={styles.modalTitle}>{selectedAchievement.title}</Text>
              <Text style={styles.modalCategory}>{selectedAchievement.category.toUpperCase()}</Text>
              <Text style={styles.modalDesc}>{selectedAchievement.description}</Text>
              <Text style={styles.modalDismiss}>TAP TO CLOSE</Text>
            </View>
          </TouchableOpacity>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  title: { color: COLORS.accent, fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: COLORS.text, fontSize: 12, marginTop: 4, letterSpacing: 1 },
  content: { padding: 16 },
  section: { marginBottom: 28 },
  categoryLabel: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.accent,
    borderRadius: 8,
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
  modalStar: { fontSize: 48, color: COLORS.accent, marginBottom: 12 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 6 },
  modalCategory: { color: COLORS.muted, fontSize: 10, letterSpacing: 3, marginBottom: 16 },
  modalDesc: { color: COLORS.text, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  modalDismiss: { color: COLORS.muted, fontSize: 10, letterSpacing: 2, marginTop: 20 },
});
