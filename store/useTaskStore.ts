import { create } from 'zustand';
import type { WeeklyAssignment } from '../lib/database.types';
import { buildTaskCompletePayload, checkAchievements } from '../lib/achievements';
import { awardTaskCredits } from '../lib/credits';
import { supabase } from '../lib/supabase';
import { useAchievementStore } from './useAchievementStore';

interface TaskState {
  myAssignments: WeeklyAssignment[];
  allAssignments: WeeklyAssignment[];
  weekStart: string | null;
  isLoading: boolean;
  fetchAssignments: (collectiveId: string, userId: string) => Promise<void>;
  completeTask: (assignmentId: string) => Promise<void>;
  uncompleteTask: (assignmentId: string) => Promise<void>;
  subscribeToAssignments: (collectiveId: string) => () => void;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export const useTaskStore = create<TaskState>((set, get) => ({
  myAssignments: [],
  allAssignments: [],
  weekStart: null,
  isLoading: false,

  fetchAssignments: async (collectiveId, userId) => {
    set({ isLoading: true });
    const weekStart = getWeekStart(new Date());
    const { data, error } = await supabase
      .from('weekly_assignments')
      .select('*')
      .eq('collective_id', collectiveId)
      .eq('week_start', weekStart);
    if (error) throw error;
    const all = data ?? [];
    set({
      allAssignments: all,
      myAssignments: all.filter((a) => a.user_id === userId),
      weekStart,
      isLoading: false,
    });
  },

  completeTask: async (assignmentId) => {
    const assignment = get().myAssignments.find((a) => a.id === assignmentId);

    const { error } = await supabase
      .from('weekly_assignments')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', assignmentId);
    if (error) throw error;

    const update = (assignments: WeeklyAssignment[]) =>
      assignments.map((a) =>
        a.id === assignmentId
          ? { ...a, status: 'complete' as const, completed_at: new Date().toISOString() }
          : a
      );
    set((state) => ({
      myAssignments: update(state.myAssignments),
      allAssignments: update(state.allAssignments),
    }));

    // Award credits immediately — weekly-reset dedup check acts as fallback
    if (assignment?.credits_value) {
      awardTaskCredits(
        assignment.user_id,
        assignment.collective_id,
        assignmentId,
        assignment.credits_value
      ).catch(() => {});
    }

    // Achievement check (fire-and-forget)
    if (assignment) {
      buildTaskCompletePayload(assignment.user_id, assignment.collective_id, assignment)
        .then((payload) =>
          checkAchievements(assignment.user_id, assignment.collective_id, {
            type: 'task_complete',
            payload,
          })
        )
        .then((unlocked) => {
          if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked);
        })
        .catch(() => {});
    }
  },

  uncompleteTask: async (assignmentId) => {
    const { error } = await supabase
      .from('weekly_assignments')
      .update({ status: 'pending', completed_at: null })
      .eq('id', assignmentId);
    if (error) throw error;

    const update = (assignments: WeeklyAssignment[]) =>
      assignments.map((a) =>
        a.id === assignmentId
          ? { ...a, status: 'pending' as const, completed_at: null }
          : a
      );
    set((state) => ({
      myAssignments: update(state.myAssignments),
      allAssignments: update(state.allAssignments),
    }));
  },

  subscribeToAssignments: (collectiveId) => {
    const channelName = `weekly_assignments:${collectiveId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_assignments', filter: `collective_id=eq.${collectiveId}` },
        () => {
          const state = get();
          // Resolve userId from auth store rather than inferring from assignments,
          // which may be empty during load.
          const { useAuthStore } = require('./useAuthStore');
          const userId = useAuthStore.getState().profile?.id;
          if (userId) state.fetchAssignments(collectiveId, userId);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
}));
