import { create } from 'zustand';
import type { Collective, CollectiveMember, TaskPreference } from '../lib/database.types';
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
  lookupCollective: (code: string) => Promise<Collective>;
  joinCollective: (collectiveId: string, userId: string) => Promise<void>;
  leaveCollective: (collectiveId: string, userId: string) => Promise<void>;
  updateRooms: (collectiveId: string, rooms: Record<string, number>) => Promise<void>;
  subscribeToMembers: (collectiveId: string, userId?: string) => () => void;
  loadPreferences: (collectiveId: string, userId: string) => Promise<void>;
  savePreferences: (collectiveId: string, userId: string, rankedTaskIds: string[]) => Promise<void>;
}

function generateCode(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

export const useCollectiveStore = create<CollectiveState>((set) => ({
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

  createCollective: async (name, timezone, rooms, creatorId) => {
    let code = '';
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateCode(5);
      const { data } = await supabase
        .from('collectives')
        .select('id')
        .eq('code', candidate)
        .maybeSingle();
      if (!data) { code = candidate; break; }
      attempts++;
    }
    if (!code) throw new Error('Could not generate unique collective code');

    const { data: collective, error } = await supabase
      .from('collectives')
      .insert({ name, display_name: `${name} Collective`, code, timezone, created_by: creatorId, rooms })
      .select()
      .single();
    if (error) throw error;

    const { error: memberError } = await supabase
      .from('collective_members')
      .insert({ collective_id: collective.id, user_id: creatorId, status: 'active' });
    if (memberError) throw memberError;

    set({ collective });
    return collective.id;
  },

  // Read-only lookup — does NOT insert membership
  lookupCollective: async (code) => {
    const { data: collective, error } = await supabase
      .from('collectives')
      .select('*')
      .eq('code', code)
      .single();
    if (error || !collective) throw new Error('Collective not found');
    return collective;
  },

  // Inserts membership — call only after the user has confirmed they want to join
  joinCollective: async (collectiveId, userId) => {
    const now = new Date();
    const status = now.getDay() === 1 ? 'active' : 'pending';

    const { error: memberError } = await supabase
      .from('collective_members')
      .insert({ collective_id: collectiveId, user_id: userId, status });
    if (memberError) throw memberError;

    const { data: collective } = await supabase
      .from('collectives')
      .select('*')
      .eq('id', collectiveId)
      .single();

    set({ collective: collective ?? null });

    buildMemberJoinedPayload(userId, collectiveId)
      .then((payload) => checkAchievements(userId, collectiveId, { type: 'member_joined', payload }))
      .then((unlocked) => { if (unlocked.length > 0) useAchievementStore.getState().pushUnlocks(unlocked); })
      .catch((err) => { if (__DEV__) console.warn('[achievements] check failed:', err?.message ?? err); });
  },

  leaveCollective: async (collectiveId, userId) => {
    const { error } = await supabase
      .from('collective_members')
      .update({ status: 'left' })
      .eq('collective_id', collectiveId)
      .eq('user_id', userId);
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
