import { create } from 'zustand';
import type { Denouncement } from '../lib/database.types';
import {
  buildDenounceMadePayload,
  buildDenounceResolvedPayload,
  buildVoteCastPayload,
  checkAchievements,
} from '../lib/achievements';
import { supabase } from '../lib/supabase';
import { useAchievementStore } from './useAchievementStore';

interface DenouncementState {
  denouncements: Denouncement[];
  myVotes: Record<string, 'uphold' | 'dismiss'>;
  isLoading: boolean;
  fetchDenouncements: (collectiveId: string) => Promise<void>;
  createDenouncement: (collectiveId: string, accuserId: string, accusedId: string, assignmentId: string) => Promise<void>;
  submitExplanation: (denouncementId: string, explanation: string) => Promise<void>;
  castVote: (denouncementId: string, voterId: string, vote: 'uphold' | 'dismiss') => Promise<void>;
  subscribeToDenouncments: (collectiveId: string, userId?: string) => () => void;
}

export const useDenouncementStore = create<DenouncementState>((set, get) => ({
  denouncements: [],
  myVotes: {},
  isLoading: false,

  fetchDenouncements: async (collectiveId) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('denouncements')
      .select('*')
      .eq('collective_id', collectiveId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    set({ denouncements: data ?? [], isLoading: false });
  },

  createDenouncement: async (collectiveId, accuserId, accusedId, assignmentId) => {
    const { data, error } = await supabase
      .from('denouncements')
      .insert({ collective_id: collectiveId, accuser_id: accuserId, accused_id: accusedId, assignment_id: assignmentId })
      .select()
      .single();
    if (error) throw error;
    set((state) => ({ denouncements: [data, ...state.denouncements] }));

    // Check double_agents at creation time (outcome not yet known, purge_the_bourgeoisie fires at resolution)
    buildDenounceMadePayload(accuserId, collectiveId, accusedId, null)
      .then((payload) => checkAchievements(accuserId, collectiveId, { type: 'denounce_made', payload }))
      .then((unlocked) => { if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked); })
      .catch(() => {});
  },

  submitExplanation: async (denouncementId, explanation) => {
    const { data, error } = await supabase
      .from('denouncements')
      .update({ explanation, status: 'responded', responded_at: new Date().toISOString() })
      .eq('id', denouncementId)
      .select()
      .single();
    if (error) throw error;
    set((state) => ({
      denouncements: state.denouncements.map((d) => (d.id === denouncementId ? data : d)),
    }));
  },

  castVote: async (denouncementId, voterId, vote) => {
    const { error } = await supabase
      .from('denouncement_votes')
      .insert({ denouncement_id: denouncementId, voter_id: voterId, vote });
    if (error) throw error;
    set((state) => ({ myVotes: { ...state.myVotes, [denouncementId]: vote } }));

    const denouncement = get().denouncements.find((d) => d.id === denouncementId);
    if (denouncement) {
      buildVoteCastPayload(voterId, denouncement.collective_id, denouncementId)
        .then((payload) => checkAchievements(voterId, denouncement.collective_id, { type: 'vote_cast', payload }))
        .then((unlocked) => { if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked); })
        .catch(() => {});
    }
  },

  subscribeToDenouncments: (collectiveId, userId) => {
    const channel = supabase
      .channel(`denouncements:${collectiveId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'denouncements', filter: `collective_id=eq.${collectiveId}` },
        async (realtimePayload) => {
          await get().fetchDenouncements(collectiveId);

          if (!userId || realtimePayload.eventType !== 'UPDATE') return;

          const prev = realtimePayload.old as Record<string, any>;
          const next = realtimePayload.new as Record<string, any>;

          const justResolved =
            (next.status === 'resolved' || next.status === 'auto_guilty') &&
            prev.status !== 'resolved' && prev.status !== 'auto_guilty';

          if (!justResolved) return;
          if (next.accuser_id !== userId && next.accused_id !== userId) return;

          const d = {
            accuser_id: next.accuser_id,
            accused_id: next.accused_id,
            outcome: next.outcome,
            explanation: next.explanation,
          };

          buildDenounceResolvedPayload(userId, collectiveId, next.id, d)
            .then((payload) => checkAchievements(userId, collectiveId, { type: 'denounce_resolved', payload }))
            .then((unlocked) => { if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked); })
            .catch(() => {});

          if (next.accuser_id === userId) {
            buildDenounceMadePayload(userId, collectiveId, next.accused_id, next.outcome)
              .then((payload) => checkAchievements(userId, collectiveId, { type: 'denounce_made', payload }))
              .then((unlocked) => { if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked); })
              .catch(() => {});
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
}));
