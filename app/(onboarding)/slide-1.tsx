import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { COLORS } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';

const { width } = Dimensions.get('window');

interface Slide {
  key: string;
  headline: (username: string) => string;
  body: string;
  ghost?: boolean;
}

const SLIDES: Slide[] = [
  {
    key: '1',
    headline: (u) => `WELCOME TO SOCIAL CREDIT, COMRADE ${u.toUpperCase()}!`,
    body: '',
  },
  {
    key: '2',
    headline: () => 'JOIN OR ESTABLISH A COLLECTIVE',
    body: 'Share household tasks and earn credits for yourself and the good of the Collective!',
  },
  {
    key: '3',
    headline: () => 'REMEMBER, COMRADE',
    body: 'You will be penalised for not completing tasks!',
  },
  { key: '4', headline: () => '', body: '', ghost: true },
];

const VISIBLE_SLIDES = SLIDES.filter((s) => !s.ghost);

export default function OnboardingScreen() {
  const { profile } = useAuthStore();
  const username = profile?.username ?? 'Comrade';
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  async function markOnboarded() {
    if (profile?.id) {
      await AsyncStorage.setItem(`onboarded_${profile.id}`, 'true');
    }
    router.replace('/(app)');
  }

  function onViewableItemsChanged({ viewableItems }: any) {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index ?? 0;
      setIndex(newIndex);
      if (SLIDES[newIndex]?.ghost) markOnboarded();
    }
  }

  function renderSlide({ item }: ListRenderItemInfo<Slide>) {
    if (item.ghost) return <View style={styles.slide} />;
    return (
      <View style={styles.slide}>
        <View style={styles.posterBanner}>
          <Text style={styles.starDecor}>★ ★ ★ ★ ★</Text>
        </View>
        <Text style={styles.headline}>{item.headline(username)}</Text>
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {VISIBLE_SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  posterBanner: {
    backgroundColor: COLORS.primary,
    width: '100%',
    paddingVertical: 40,
    marginBottom: 40,
    alignItems: 'center',
    borderRadius: 4,
  },
  starDecor: { color: COLORS.accent, fontSize: 24, letterSpacing: 8 },
  headline: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 32,
  },
  body: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    alignItems: 'center',
    gap: 16,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surface,
  },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },
});
