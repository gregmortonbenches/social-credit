import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useCollectiveStore } from '../../store/useCollectiveStore';

export default function AppLayout() {
  const profileId = useAuthStore((s) => s.profile?.id);

  // The home screen used to be the only place the collective was loaded, so
  // refreshing on /settings or /collective/edit-tasks (web) showed them empty.
  useEffect(() => {
    if (profileId && !useCollectiveStore.getState().collective) {
      useCollectiveStore.getState().loadUserCollective(profileId);
    }
  }, [profileId]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0EAD6' } }} />
  );
}
