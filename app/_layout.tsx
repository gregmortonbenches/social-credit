import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
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
    if (!session) {
      router.replace('/(auth)/sign-in');
      return;
    }
    // Route authenticated users — show onboarding if they haven't seen it
    AsyncStorage.getItem(`onboarded_${session.user.id}`).then((seen) => {
      if (seen === 'true') {
        router.replace('/(app)');
      } else {
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
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0EAD6' } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
