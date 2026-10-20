import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useRef, useState, type ComponentType } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import {
  CollectiveIllustration,
  PenaltyIllustration,
  WelcomeIllustration,
} from '../../components/onboarding/OnboardingIllustration';
import { PropagandaButton } from '../../components/ui/PropagandaButton';
import { COLORS, WEB_MAX_WIDTH } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';

interface Slide {
  key: string;
  headline: (username: string) => string;
  body: string;
  illustration?: ComponentType;
  ghost?: boolean;
}

const SLIDES: Slide[] = [
  {
    key: '1',
    headline: (u) => `WELCOME TO SOCIAL CREDIT, COMRADE ${u.toUpperCase()}!`,
    body: '',
    illustration: WelcomeIllustration,
  },
  {
    key: '2',
    headline: () => 'JOIN OR ESTABLISH A COLLECTIVE',
    body: 'Share household tasks and earn credits for yourself and the good of the Collective!',
    illustration: CollectiveIllustration,
  },
  {
    key: '3',
    headline: () => 'REMEMBER, COMRADE',
    body: 'You will be penalised for not completing tasks!',
    illustration: PenaltyIllustration,
  },
  { key: '4', headline: () => '', body: '', ghost: true },
];

const VISIBLE_SLIDES = SLIDES.filter((s) => !s.ghost);

export default function OnboardingScreen() {
  const { profile } = useAuthStore();
  // The slides page by this width, so on web it must be the app column's, not the
  // window's. (It was read once at module load, which was also stale after a rotate.)
  const { width: windowWidth } = useWindowDimensions();
  const width = Platform.OS === 'web' ? Math.min(windowWidth, WEB_MAX_WIDTH) : windowWidth;
  const finishing = useRef(false);
  const username = profile?.username ?? 'Comrade';
  const [index, setIndex] = useState(0);
  const isLast = index >= VISIBLE_SLIDES.length - 1;
  const listRef = useRef<FlatList>(null);

  async function markOnboarded() {
    // Reaching the hidden last slide and tapping Begin could both land here.
    if (finishing.current) return;
    finishing.current = true;
    if (profile?.id) {
      await AsyncStorage.setItem(`onboarded_${profile.id}`, 'true');
    }
    router.replace('/(app)');
  }

  // FlatList throws ("Changing onViewableItemsChanged on the fly is not supported")
  // if this callback's identity changes, and a function declared in the component
  // is new on every render, which setIndex below causes. Keep one for the life of
  // the screen and reach the current handlers through a ref. That crash is what
  // left people stuck on the intro slides after the first swipe.
  const markOnboardedRef = useRef(markOnboarded);
  markOnboardedRef.current = markOnboarded;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index ?? 0;
      setIndex(newIndex);
      if (SLIDES[newIndex]?.ghost) markOnboardedRef.current();
    }
  }).current;

  function renderSlide({ item }: ListRenderItemInfo<Slide>) {
    if (item.ghost) return <View style={[styles.slide, { width }]} />;
    const Illustration = item.illustration;
    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.posterBanner}>
          {Illustration ? <Illustration /> : null}
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
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
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

        {/* Swiping to the hidden last slide used to be the only way out, which is
            easy to miss (and flaky) with a finger on a mobile browser. */}
        <PropagandaButton
          title={isLast ? 'Begin' : 'Next'}
          onPress={() =>
            isLast ? markOnboarded() : listRef.current?.scrollToIndex({ index: index + 1, animated: true })
          }
          style={styles.cta}
        />
        {!isLast ? (
          <TouchableOpacity onPress={markOnboarded} accessibilityRole="button" accessibilityLabel="Skip the introduction">
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  posterBanner: {
    backgroundColor: COLORS.primary,
    width: '100%',
    height: 180,
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    overflow: 'hidden',
  },
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
  cta: { alignSelf: 'stretch' },
  skip: { color: COLORS.muted, fontSize: 13, textDecorationLine: 'underline' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surface,
  },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },
});
