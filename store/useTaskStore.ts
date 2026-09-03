import { create } from 'zustand';
import type { WeeklyAssignment } from '../lib/database.types';
import { buildTaskCompletePayload, checkAchievements } from '../lib/achievements';
import { awardTaskCredits } from '../lib/credits';
import { collectiveWeekStart } from '../lib/draft';
import { supabase } from '../lib/supabase';
import { useAchievementStore } from './useAchievementStore';

interface TaskState {
  myAssignments: WeeklyAssignment[];
  allAssignments: WeeklyAssignment[];
  weekStart: string | null;
  isLoading: boolean;
  /** Last fetch failure, for the panel to surface. Null once a fetch succeeds. */
  error: string | null;
  fetchAssignments: (collectiveId: string, userId: string, timezone: string) => Promise<void>;
  completeTask: (assignmentId: string) => Promise<void>;
  uncompleteTask: (assignmentId: string) => Promise<void>;
  subscribeToAssignments: (collectiveId: string) => () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  myAssignments: [],
  allAssignments: [],
  weekStart: null,
  isLoading: false,
  error: null,

  // `week_start` is the Monday of the week in the COLLECTIVE's timezone, so the
  // query has to be built in that timezone too. The old device-local helper also
  // ran the result through toISOString(), which re-converts to UTC — so for any
  // device behind UTC the evening hours produced tomorrow's date. Since the
  // column only ever holds Mondays, that matched no rows at all and the user's
  // whole task list silently emptied every evening.
  fetchAssignments: async (collectiveId, userId, timezone) => {
    set({ isLoading: true });
    const weekStart = collectiveWeekStart(timezone);
    const { data, error } = await supabase
      .from('weekly_assignments')
      .select('*')
      .eq('collective_id', collectiveId)
      .eq('week_start', weekStart);

    // Previously this threw, from inside an unawaited useEffect call with no
    // catch. isLoading was never cleared, so one failed request — a dropped
    // connection, a paused Supabase project — left the Tasks panel blank and
    // spinning forever with no way back short of restarting the app. Record the
    // failure instead so the panel can show it and offer a retry.
    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }

    const all = data ?? [];
    set({
      allAssignments: all,
      myAssignments: all.filter((a) => a.user_id === userId),
      weekStart,
      isLoading: false,
      error: null,
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

    // Settle the credits now, via the award-task-credits Edge Function. It is
    // idempotent and weekly-reset runs the same dedup check, so weekly-reset
    // remains a genuine fallback if this call fails (offline, say) rather than
    // the only path it used to be.
    if (assignment?.credits_value) {
      awardTaskCredits(assignmentId).catch((err) => {
        if (__DEV__) console.warn('[tasks] immediate credit award failed:', err?.message ?? err);
      });
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
        .catch((err) => { if (__DEV__) console.warn('[achievements] check failed:', err?.message ?? err); });
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
          const { useCollectiveStore } = require('./useCollectiveStore');
          const userId = useAuthStore.getState().profile?.id;
          const timezone = useCollectiveStore.getState().collective?.timezone;
          if (userId && timezone) state.fetchAssignments(collectiveId, userId, timezone);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
}));
