import { create } from 'zustand';
import type { Collective, CollectiveMember, CollectiveSummary, TaskPreference } from '../lib/database.types';
import { buildMemberJoinedPayload, checkAchievements } from '../lib/achievements';
import { supabase } from '../lib/supabase';
import { useAchievementStore } from './useAchievementStore';

interface CollectiveState {
  collective: Collective | null;
  members: CollectiveMember[];
  taskPreferences: TaskPreference[];
  isLoading: boolean;
  fetchCollective: (collectiveId: string) => Promise<void>;
  createCollective: (name: string, timezone: string, rooms: Record<string, number>, creatorId: string) => Promise<string>;
  lookupCollective: (code: string) => Promise<CollectiveSummary>;
  joinCollective: (code: string, userId: string) => Promise<void>;
  leaveCollective: (collectiveId: string, userId: string) => Promise<void>;
  updateRooms: (collectiveId: string, rooms: Record<string, number>) => Promise<void>;
  subscribeToMembers: (collectiveId: string, userId?: string) => () => void;
  loadPreferences: (collectiveId: string, userId: string) => Promise<void>;
  savePreferences: (collectiveId: string, userId: string, rankedTaskIds: string[]) => Promise<void>;
}

export const useCollectiveStore = create<CollectiveState>((set, get) => ({
  collective: null,
  members: [],
  taskPreferences: [],
  isLoading: false,

  fetchCollective: async (collectiveId) => {
    set({ isLoading: true });
    const [{ data: collective }, { data: members }] = await Promise.all([
      supabase.from('collectives').select('*').eq('id', collectiveId).single(),
      supabase.from('collective_members').select('*').eq('collective_id', collectiveId),
    ]);
    set({ collective: collective ?? null, members: members ?? [], isLoading: false });
  },

  // Code generation, the collective row and the creator's membership row are all
  // done by create_collective() in one transaction — see migration 013. The old
  // client-side version raced on the code (SELECT to check, then INSERT) and
  // relied on a blanket SELECT policy over every collective to do the check.
  createCollective: async (name, timezone, rooms, _creatorId) => {
    const { data: collective, error } = await supabase.rpc('create_collective', {
      p_name: name,
      p_timezone: timezone,
      p_rooms: rooms,
    });
    if (error) throw error;
    if (!collective) throw new Error('Could not create Collective');

    // Load members too. Setting only `collective` left `members` empty, and the
    // home screen does not re-run its lookup for an already-mounted session — so
    // the founder saw an empty COMRADE STATUS list without even themselves in it.
    set({ collective });
    await get().fetchCollective(collective.id);
    return collective.id;
  },

  // Read-only lookup — does NOT insert membership.
  // Goes through lookup_collective_by_code() because `collectives` is readable
  // only by its own members; a prospective joiner is not one yet. The RPC
  // returns id/name/display_name for one exact code match and nothing else.
  lookupCollective: async (code) => {
    const { data, error } = await supabase.rpc('lookup_collective_by_code', {
      p_code: code,
    });
    if (error) throw error;
    const match = data?.[0];
    if (!match) throw new Error('Collective not found');
    return match;
  },

  // Inserts membership — call only after the user has confirmed they want to join.
  // Takes the join code, not the collective id: possession of the code is what
  // authorises the join, and that is now checked in the database rather than
  // trusted from the client (migration 013). The RPC also decides active vs
  // pending using the COLLECTIVE's timezone — the old client-side
  // `now.getDay() === 1` used the device timezone, which contradicts the
  // collective-timezone rule in CLAUDE.md.
  joinCollective: async (code, userId) => {
    const { data: collective, error } = await supabase.rpc('join_collective_by_code', {
      p_code: code,
    });
    if (error) throw error;
    if (!collective) throw new Error('Collective not found');

    const collectiveId = collective.id;
    set({ collective });
    await get().fetchCollective(collectiveId);

    buildMemberJoinedPayload(userId, collectiveId)
      .then((payload) => checkAchievements(userId, collectiveId, { type: 'member_joined', payload }))
      .then((unlocked) => { if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked); })
      .catch((err) => { if (__DEV__) console.warn('[achievements] check failed:', err?.message ?? err); });
  },

  leaveCollective: async (collectiveId, _userId) => {
    const { error } = await supabase.rpc('leave_collective', {
      p_collective_id: collectiveId,
    });
    if (error) throw error;
    set({ collective: null, members: [] });
  },

  updateRooms: async (collectiveId, rooms) => {
    const { data, error } = await supabase
      .from('collectives')
      .update({ rooms })
      .eq('id', collectiveId)
      .select()
      .single();
    if (error) throw error;
    set({ collective: data });
  },

  loadPreferences: async (collectiveId, userId) => {
    const { data } = await supabase
      .from('task_preferences')
      .select('*')
      .eq('collective_id', collectiveId)
      .eq('user_id', userId)
      .order('rank', { ascending: true });
    set({ taskPreferences: data ?? [] });
  },

  savePreferences: async (collectiveId, userId, rankedTaskIds) => {
    if (rankedTaskIds.length === 0) return;
    const rows = rankedTaskIds.map((taskId, i) => ({
      user_id: userId,
      collective_id: collectiveId,
      task_id: taskId,
      rank: i + 1,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('task_preferences')
      .upsert(rows, { onConflict: 'user_id,collective_id,task_id' });
    if (error) throw error;

    // Remove any preferences for tasks no longer in the ranked list
    const { error: deleteError } = await supabase
      .from('task_preferences')
      .delete()
      .eq('collective_id', collectiveId)
      .eq('user_id', userId)
      .not('task_id', 'in', `(${rankedTaskIds.map((id) => `"${id}"`).join(',')})`);
    if (deleteError) throw deleteError;

    set({ taskPreferences: rows.map((r, i) => ({ ...r, id: '', rank: i + 1 })) });
  },

  subscribeToMembers: (collectiveId, userId) => {
    const channelName = `collective_members:${collectiveId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'collective_members', filter: `collective_id=eq.${collectiveId}` },
        async (realtimePayload) => {
          const { data } = await supabase
            .from('collective_members')
            .select('*')
            .eq('collective_id', collectiveId);
          set({ members: data ?? [] });

          // When a new active member joins, check gang_of_four for all existing members
          if (userId && realtimePayload.eventType === 'INSERT') {
            const newMember = realtimePayload.new as Record<string, any>;
            if (newMember.status === 'active' && newMember.user_id !== userId) {
              buildMemberJoinedPayload(userId, collectiveId)
                .then((payload) => checkAchievements(userId, collectiveId, { type: 'member_joined', payload }))
                .then((unlocked) => { if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked); })
                .catch((err) => { if (__DEV__) console.warn('[achievements] check failed:', err?.message ?? err); });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
}));
