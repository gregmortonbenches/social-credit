import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getTaskIcon } from '../../constants/tasks';
import { COLORS } from '../../constants/theme';
import { formatNextAssignment, isSameCollectiveDay } from '../../lib/draft';
import type { TaskLibrary } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useCollectiveStore } from '../../store/useCollectiveStore';
import { useTaskStore } from '../../store/useTaskStore';
import { TaskCard } from './TaskCard';

export function TasksPanel() {
  const profile = useAuthStore((s) => s.profile);
  const { myAssignments, allAssignments, fetchAssignments, isLoading, error } = useTaskStore();
  const collective = useCollectiveStore((s) => s.collective);
  const members = useCollectiveStore((s) => s.members);
  const fetchCollective = useCollectiveStore((s) => s.fetchCollective);
  const [taskLibrary, setTaskLibrary] = useState<Record<string, TaskLibrary>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTaskLibrary();
  }, []);

  // Realtime can drop (backgrounded app, flaky connection) and there was no way
  // to recover short of restarting. Pull-to-refresh re-fetches everything.
  const onRefresh = useCallback(async () => {
    if (!collective || !profile) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchAssignments(collective.id, profile.id, collective.timezone),
        fetchCollective(collective.id),
        loadTaskLibrary(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [collective?.id, profile?.id]);

  async function loadTaskLibrary() {
    const { data, error: libError } = await supabase.from('task_library').select('*');
    // Swallowing this left every task card showing the placeholder em-dash with
    // no indication anything had gone wrong.
    if (libError) {
      if (__DEV__) console.warn('[tasks] task library load failed:', libError.message);
      return;
    }
    if (data) {
      setTaskLibrary(Object.fromEntries(data.map((t) => [t.id, t])));
    }
  }

  // "Is this due today?" is a calendar question, and the calendar that counts is
  // the collective's. toDateString() answers it in the device's timezone, so a
  // comrade in another timezone saw a task due Sunday 23:59 collective time
  // bucketed under a different day from everyone else in the household.
  // (Overdue is a comparison of two instants, so it is timezone-independent.)
  const tz = collective?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  const completed = myAssignments.filter((a) => a.status === 'complete');
  const overdue = myAssignments.filter(
    (a) => a.status === 'pending' && new Date(a.due_date) < now
  );
  const today = myAssignments.filter((a) => {
    const due = new Date(a.due_date);
    return a.status === 'pending' && due >= now && isSameCollectiveDay(due, now, tz);
  });
  const upcoming = myAssignments.filter((a) => {
    const due = new Date(a.due_date);
    return a.status === 'pending' && due > now && !isSameCollectiveDay(due, now, tz);
  });
  const comradesAssignments = allAssignments.filter((a) => a.user_id !== profile?.id);
  const myStatus = members.find((m) => m.user_id === profile?.id)?.status;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />
      }
    >
      <View style={styles.posterContainer}>
        <Image
          source={require('../../assets/images/propaganda-poster.jpg')}
          style={styles.poster}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', COLORS.background]}
          style={styles.posterFade}
        />
      </View>
      <View style={styles.content}>
      <Text style={styles.bannerText} accessibilityRole="header">TASKS</Text>
      <View style={styles.titleRule} />

      {/* The running total. Completion floats a "+83" off the card; without
          somewhere for it to land, nothing in the app visibly accumulated. */}
      <View style={styles.creditBar}>
        <Text style={styles.creditLabel}>YOUR CREDITS</Text>
        <Text style={styles.creditValue}>{(profile?.total_credits ?? 0).toLocaleString()}</Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorHeading}>CANNOT REACH THE COLLECTIVE</Text>
          <Text style={styles.errorBody}>
            Your duties could not be loaded. Check your connection and pull down to
            try again, Comrade.
          </Text>
          <Text style={styles.errorDetail}>{error}</Text>
        </View>
      ) : null}

      {/* `isLoading` guard so the notice does not flash during the first fetch,
          when myAssignments is legitimately empty but about to be filled. */}
      {myAssignments.length === 0 && !isLoading && !error ? (
        <NoAssignmentsNotice
          isPending={myStatus === 'pending'}
          timezone={collective?.timezone}
        />
      ) : null}

      {overdue.length > 0 && (
        <Section title="OVERDUE TASKS" titleColor={COLORS.danger}>
          {overdue.map((a) => (
            <TaskCard key={a.id} assignment={a} taskName={taskLibrary[a.task_id]?.name ?? '—'} iconName={getTaskIcon(taskLibrary[a.task_id]?.name ?? '', taskLibrary[a.task_id]?.room_type)} />
          ))}
        </Section>
      )}

      {myAssignments.length > 0 && (
        <Section title="TODAY'S DUTIES">
          {today.length === 0 ? (
            <Text style={styles.empty}>No tasks due today, Comrade.</Text>
          ) : (
            today.map((a) => (
              <TaskCard key={a.id} assignment={a} taskName={taskLibrary[a.task_id]?.name ?? '—'} iconName={getTaskIcon(taskLibrary[a.task_id]?.name ?? '', taskLibrary[a.task_id]?.room_type)} />
            ))
          )}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="UPCOMING">
          {upcoming.map((a) => (
            <TaskCard key={a.id} assignment={a} taskName={taskLibrary[a.task_id]?.name ?? '—'} iconName={getTaskIcon(taskLibrary[a.task_id]?.name ?? '', taskLibrary[a.task_id]?.room_type)} />
          ))}
        </Section>
      )}


      {completed.length > 0 && (
        <Section title="COMPLETED THIS WEEK" collapsible>
          {completed.map((a) => (
            <TaskCard key={a.id} assignment={a} taskName={taskLibrary[a.task_id]?.name ?? '—'} iconName={getTaskIcon(taskLibrary[a.task_id]?.name ?? '', taskLibrary[a.task_id]?.room_type)} />
          ))}
        </Section>
      )}

      <Section title="YOUR COMRADES' DUTIES" collapsible>
        {comradesAssignments.map((a) => (
          <TaskCard
            key={a.id}
            assignment={a}
            taskName={taskLibrary[a.task_id]?.name ?? '—'}
            iconName={getTaskIcon(taskLibrary[a.task_id]?.name ?? '', taskLibrary[a.task_id]?.room_type)}
            readOnly
          />
        ))}
        {comradesAssignments.length === 0 && (
          <Text style={styles.empty}>No tasks assigned to other Comrades yet.</Text>
        )}
      </Section>
      </View>
    </ScrollView>
  );
}

/**
 * Shown when the user has no assignments at all — the state a new member lands
 * in, and the state everyone is in between Monday's reset and Sunday's
 * auto-assignment. Previously this rendered as a single italic line reading
 * "No tasks due today, Comrade", which explained neither why the screen was
 * empty nor when that would change.
 */
function NoAssignmentsNotice({ isPending, timezone }: { isPending: boolean; timezone?: string }) {
  const when = timezone ? formatNextAssignment(timezone) : null;

  return (
    <View style={noticeStyles.card}>
      <Text style={noticeStyles.heading}>
        {isPending ? 'AWAITING INDUCTION' : 'NO DUTIES ASSIGNED'}
      </Text>

      {isPending ? (
        <Text style={noticeStyles.body}>
          You joined mid-week, Comrade. You become a full member of the Collective
          at Monday 00:00, and receive your first duties in the assignment that
          follows.
        </Text>
      ) : (
        <Text style={noticeStyles.body}>
          Duties are assigned automatically every Sunday afternoon
          {when ? ` — next ${when}` : ''}. Rank your preferred tasks now and the
          Collective will take your wishes into account.
        </Text>
      )}

      <TouchableOpacity
        style={noticeStyles.btn}
        onPress={() => router.push('/(app)/collective/preferences')}
        accessibilityRole="button"
        accessibilityLabel="Set my task preferences"
      >
        <Text style={noticeStyles.btnText}>SET MY TASK PREFERENCES</Text>
      </TouchableOpacity>
    </View>
  );
}

const noticeStyles = StyleSheet.create({
  card: {
    borderTopWidth: 4,
    borderTopColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    padding: 18,
    marginBottom: 24,
  },
  heading: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },
  body: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  btn: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: {
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 12,
  },
});

function Section({
  title,
  titleColor,
  children,
  collapsible,
}: {
  title: string;
  titleColor?: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible ?? false);

  // A Text with onPress is not announced as a control and has no tap target
  // beyond the glyphs themselves. Collapsible sections get a real button.
  return (
    <View style={sectionStyles.container}>
      {collapsible ? (
        <TouchableOpacity
          onPress={() => setCollapsed((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: !collapsed }}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Text style={[sectionStyles.title, titleColor ? { color: titleColor } : null]}>
            {title} {collapsed ? '▸' : '▾'}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text
          style={[sectionStyles.title, titleColor ? { color: titleColor } : null]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      )}
      {!collapsed && children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  posterContainer: { position: 'relative' },
  poster: { width: '100%', height: 220 },
  posterFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  content: { padding: 16 },
  bannerText: { color: COLORS.primary, fontWeight: '900', letterSpacing: 3, fontSize: 26, marginBottom: 10, textAlign: 'center' },
  titleRule: { height: 3, backgroundColor: COLORS.primary, marginBottom: 14 },
  creditBar: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
    paddingBottom: 10,
    marginBottom: 20,
  },
  creditLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  creditValue: {
    color: COLORS.primary,
    fontFamily: 'SpaceMono',
    fontSize: 24,
    fontWeight: '700',
  },
  empty: { color: COLORS.muted, fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  errorCard: {
    borderTopWidth: 4,
    borderTopColor: COLORS.danger,
    backgroundColor: COLORS.surface,
    padding: 18,
    marginBottom: 24,
  },
  errorHeading: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },
  errorBody: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  errorDetail: { color: COLORS.muted, fontSize: 11, marginTop: 10, fontFamily: 'SpaceMono' },
});
