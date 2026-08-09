import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getTaskIcon } from '../../constants/tasks';
import { COLORS } from '../../constants/theme';
import type { TaskLibrary } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useTaskStore } from '../../store/useTaskStore';
import { TaskCard } from './TaskCard';

export function TasksPanel() {
  const profile = useAuthStore((s) => s.profile);
  const { myAssignments, allAssignments } = useTaskStore();
  const [taskLibrary, setTaskLibrary] = useState<Record<string, TaskLibrary>>({});

  useEffect(() => {
    loadTaskLibrary();
  }, []);

  async function loadTaskLibrary() {
    const { data } = await supabase.from('task_library').select('*');
    if (data) {
      setTaskLibrary(Object.fromEntries(data.map((t) => [t.id, t])));
    }
  }

  const completed = myAssignments.filter((a) => a.status === 'complete');
  const overdue = myAssignments.filter(
    (a) => a.status === 'pending' && new Date(a.due_date) < new Date()
  );
  const today = myAssignments.filter((a) => {
    const due = new Date(a.due_date);
    const now = new Date();
    return (
      a.status === 'pending' &&
      due.toDateString() === now.toDateString() &&
      due >= now
    );
  });
  const upcoming = myAssignments.filter((a) => {
    const due = new Date(a.due_date);
    const now = new Date();
    return a.status === 'pending' && due > now && due.toDateString() !== now.toDateString();
  });
  const comradesAssignments = allAssignments.filter((a) => a.user_id !== profile?.id);

  return (
    <ScrollView style={styles.container}>
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
      <Text style={styles.bannerText}>TASKS</Text>
      <View style={styles.titleRule} />

      {overdue.length > 0 && (
        <Section title="OVERDUE TASKS" titleColor={COLORS.danger}>
          {overdue.map((a) => (
            <TaskCard key={a.id} assignment={a} taskName={taskLibrary[a.task_id]?.name ?? '—'} iconName={getTaskIcon(taskLibrary[a.task_id]?.name ?? '', taskLibrary[a.task_id]?.room_type)} />
          ))}
        </Section>
      )}

      <Section title="TODAY'S DUTIES">
        {today.length === 0 ? (
          <Text style={styles.empty}>No tasks due today, Comrade.</Text>
        ) : (
          today.map((a) => (
            <TaskCard key={a.id} assignment={a} taskName={taskLibrary[a.task_id]?.name ?? '—'} iconName={getTaskIcon(taskLibrary[a.task_id]?.name ?? '', taskLibrary[a.task_id]?.room_type)} />
          ))
        )}
      </Section>

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

  return (
    <View style={sectionStyles.container}>
      <Text
        style={[sectionStyles.title, titleColor ? { color: titleColor } : null]}
        onPress={collapsible ? () => setCollapsed((v) => !v) : undefined}
      >
        {title} {collapsible ? (collapsed ? '▸' : '▾') : ''}
      </Text>
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
  titleRule: { height: 3, backgroundColor: COLORS.primary, marginBottom: 20 },
  empty: { color: COLORS.muted, fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
});
