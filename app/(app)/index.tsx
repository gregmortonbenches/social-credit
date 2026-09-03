import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AchievementUnlockOverlay } from '../../components/achievements/AchievementUnlockOverlay';
import { CollectivePanel } from '../../components/collective/CollectivePanel';
import { ScoreboardPanel } from '../../components/collective/ScoreboardPanel';
import { TasksPanel } from '../../components/tasks/TasksPanel';
import { LoadingScreen } from '../../components/ui/LoadingScreen';
import { COLORS } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { useCollectiveStore } from '../../store/useCollectiveStore';
import { useTaskStore } from '../../store/useTaskStore';

const PANELS = ['COLLECTIVE', 'TASKS', 'SCOREBOARD'];
const DEFAULT_PANEL = 1;

export default function HomeScreen() {
  const { profile, isLoading: authLoading } = useAuthStore();
  const { collective, fetchCollective, subscribeToMembers, loadPreferences } = useCollectiveStore();
  const { fetchAssignments, subscribeToAssignments } = useTaskStore();
  const { width } = useWindowDimensions();

  const [panelIndex, setPanelIndex] = useState(DEFAULT_PANEL);
  const listRef = useRef<FlatList>(null);
  const [collectiveLoaded, setCollectiveLoaded] = useState(false);
  const [showPrefsModal, setShowPrefsModal] = useState(false);

  useEffect(() => {
    if (!profile) {
      setCollectiveLoaded(true);
      return;
    }
    loadUserCollective();
  }, [profile]);

  useEffect(() => {
    if (!collective || !profile) return;
    fetchAssignments(collective.id, profile.id, collective.timezone);
    const unsubTasks = subscribeToAssignments(collective.id);
    const unsubMembers = subscribeToMembers(collective.id, profile.id);
    loadPreferences(collective.id, profile.id).then(() => {
      checkPrefsPrompt(collective.id, profile.id);
    });
    return () => { unsubTasks(); unsubMembers(); };
  }, [collective?.id]);

  async function checkPrefsPrompt(collectiveId: string, userId: string) {
    const key = `prefs_prompted_${collectiveId}_${userId}`;
    const dismissed = await AsyncStorage.getItem(key);
    if (dismissed) return;
    // loadPreferences() has already fetched this collective/user's preferences into
    // the store, so read from there rather than issuing a second identical query.
    if (useCollectiveStore.getState().taskPreferences.length === 0) {
      setShowPrefsModal(true);
    }
  }

  async function dismissPrefsModal() {
    setShowPrefsModal(false);
    if (!collective || !profile) return;
    await AsyncStorage.setItem(`prefs_prompted_${collective.id}_${profile.id}`, '1');
  }

  async function loadUserCollective() {
    if (!profile) return;
    const { supabase } = await import('../../lib/supabase');
    const { data: rows, error } = await supabase
      .from('collective_members')
      .select('collective_id')
      .eq('user_id', profile.id)
      .in('status', ['active', 'paused', 'pending'])
      .order('joined_at', { ascending: false })
      .limit(1);
    if (error) console.error('[home] collective_members lookup failed:', JSON.stringify(error));
    const row = rows?.[0] ?? null;
    if (row?.collective_id) {
      await fetchCollective(row.collective_id);
    }
    setCollectiveLoaded(true);
  }

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
    if (viewableItems.length > 0) setPanelIndex(viewableItems[0].index ?? 0);
  }, []);

  if (authLoading || !collectiveLoaded) {
    return <LoadingScreen />;
  }

  if (!collective) {
    return <NoCollectiveLanding username={profile?.username ?? ''} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={listRef}
        data={PANELS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={DEFAULT_PANEL}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ index }) => (
          <View style={{ width }}>
            {index === 0 && <CollectivePanel />}
            {index === 1 && <TasksPanel />}
            {index === 2 && <ScoreboardPanel />}
          </View>
        )}
        keyExtractor={(_, i) => String(i)}
      />

      {/* These dots are the only way to navigate between panels (decision 17), so
          they need a real tap target and a name. The dot itself stays 10px; the
          touchable around it is 44x44, the platform minimum. */}
      <View style={styles.dotRow} accessibilityRole="tablist">
        {PANELS.map((label, i) => (
          <TouchableOpacity
            key={i}
            style={styles.dotHit}
            onPress={() => {
              listRef.current?.scrollToIndex({ index: i, animated: true });
              setPanelIndex(i);
            }}
            accessibilityRole="tab"
            accessibilityLabel={`${label} panel`}
            accessibilityState={{ selected: i === panelIndex }}
          >
            <View style={[styles.dot, i === panelIndex && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      <AchievementUnlockOverlay />

      <Modal visible={showPrefsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>TASK PREFERENCES</Text>
            <Text style={styles.modalBody}>
              Comrade {profile?.username}, the Collective assigns tasks automatically each Sunday.
              {'\n\n'}
              Rank your preferred tasks now so the system can assign according to your wishes — better performers pick first.
            </Text>
            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Set my task preferences"
              onPress={() => {
                dismissPrefsModal();
                router.push('/(app)/collective/preferences');
              }}
            >
              <Text style={styles.modalPrimaryText}>SET MY PREFERENCES</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={dismissPrefsModal}
              accessibilityRole="button"
              accessibilityLabel="Later"
            >
              <Text style={styles.modalSecondaryText}>LATER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function NoCollectiveLanding({ username }: { username: string }) {
  const { signOut } = useAuthStore();
  return (
    <View style={styles.landing}>
      {username.length > 0 && (
        <Text style={styles.landingGreeting}>WELCOME, COMRADE {username.toUpperCase()}</Text>
      )}
      <Text style={styles.landingPrompt}>You belong to no collective. Choose your path.</Text>

      <TouchableOpacity
        style={styles.landingBtn}
        onPress={() => router.push('/(app)/collective/create')}
        accessibilityRole="button"
        accessibilityLabel="Create a Collective"
      >
        <Text style={styles.landingBtnText}>★ CREATE A COLLECTIVE</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.landingBtn, styles.landingBtnSecondary]}
        onPress={() => router.push('/(app)/collective/join')}
        accessibilityRole="button"
        accessibilityLabel="Join a Collective"
      >
        <Text style={[styles.landingBtnText, styles.landingBtnTextSecondary]}>JOIN A COLLECTIVE</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.landingSignOut}
        onPress={signOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.landingSignOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  landing: { flex: 1, backgroundColor: COLORS.background, padding: 32, alignItems: 'center', justifyContent: 'center' },
  landingGreeting: {
    color: COLORS.primary,
    fontWeight: '900',
    letterSpacing: 2,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  landingPrompt: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 28,
  },
  landingBtn: {
    backgroundColor: COLORS.primary,
    width: '100%',
    padding: 18,
    borderRadius: 0,
    alignItems: 'center',
    marginBottom: 14,
  },
  landingBtnSecondary: { backgroundColor: 'transparent', borderWidth: 2, borderColor: COLORS.primary },
  landingBtnText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 3, fontSize: 14 },
  landingBtnTextSecondary: { color: COLORS.primary },
  landingSignOut: { marginTop: 32 },
  landingSignOutText: { color: COLORS.muted, fontSize: 13, textDecorationLine: 'underline' },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  dotHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.muted,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.background,
    padding: 24,
    borderTopWidth: 3,
    borderTopColor: COLORS.primary,
  },
  modalTitle: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalBody: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  modalPrimaryBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    alignItems: 'center',
    borderRadius: 0,
    marginBottom: 10,
  },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 2, fontSize: 13 },
  modalSecondaryBtn: {
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 0,
  },
  modalSecondaryText: { color: COLORS.primary, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
});
