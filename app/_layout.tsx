import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { WEB_MAX_WIDTH } from '../constants/theme';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { registerForPushNotifications } from '../lib/notifications';
import { useAuthStore } from '../store/useAuthStore';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const { loadSession, isLoading: authLoading, session, profile } = useAuthStore();
  const section = useSegments()[0];

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      loadSession();
    }
  }, [loaded]);

  // Auto-route on cold open once auth is resolved
  useEffect(() => {
    if (authLoading) return;
    // Only redirect when the user is outside the section they belong in. On web a
    // refresh lands on the URL they were on (/settings, /collective/edit-tasks);
    // sending everyone to the home screen threw that away.
    if (!session) {
      if (section !== '(auth)') router.replace('/(auth)/sign-in');
      return;
    }
    // Route authenticated users — show onboarding if they haven't seen it
    AsyncStorage.getItem(`onboarded_${session.user.id}`).then((seen) => {
      if (seen === 'true') {
        if (section !== '(app)') router.replace('/(app)');
      } else if (section !== '(onboarding)') {
        router.replace('/(onboarding)/slide-1');
      }
    });
  }, [authLoading, session?.user.id]);

  useEffect(() => {
    if (profile?.id) {
      registerForPushNotifications(profile.id);
    }
  }, [profile?.id]);

  if (!loaded || authLoading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.page}>
      <View style={styles.column}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0EAD6' } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
        </Stack>
      </View>
    </View>
  );
}

// The screens are designed for a phone. In a browser, keep them a poster-width
// column in the middle of the page rather than stretching across the monitor.
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F0EAD6', alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? WEB_MAX_WIDTH : undefined },
});
