import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { getRandomProverb } from '../../constants/proverbs';
import { COLORS } from '../../constants/theme';

export function LoadingScreen() {
  const progress = useRef(new Animated.Value(0)).current;
  const proverb = getRandomProverb();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(progress, { toValue: 0.2, duration: 1000, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SOCIAL{'\n'}CREDIT</Text>
      <View style={styles.illustrationPlaceholder}>
        <Text style={styles.illustrationText}>[ POSTER ART ]</Text>
      </View>
      <Text style={styles.loadingLabel}>MENTAL LOADing...</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressBar, { width: barWidth }]} />
      </View>
      <Text style={styles.proverb}>"{proverb}"</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: COLORS.primary,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
    lineHeight: 52,
    marginBottom: 24,
  },
  illustrationPlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  illustrationText: { color: COLORS.muted, fontSize: 12, letterSpacing: 2 },
  progressTrack: {
    width: '100%',
    height: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginBottom: 20,
  },
  progressBar: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 6 },
  loadingLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 8, textAlign: 'center' },
  proverb: {
    color: COLORS.muted,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
});
