import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { CONFIG } from '../constants/config';
import type { Profile } from '../lib/database.types';
import { supabase } from '../lib/supabase';

async function fetchOrCreateProfile(session: Session): Promise<Profile | null> {
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (fetchError) console.error('[auth] profile fetch error:', JSON.stringify(fetchError));
  if (existing) {
    console.log('[auth] profile loaded for', session.user.email);
    return existing;
  }

  console.warn('[auth] no profile row found — attempting upsert for', session.user.id);
  const username =
    (session.user.user_metadata?.username as string | undefined) ??
    session.user.email?.split('@')[0] ??
    'comrade';
  const { data: created, error: upsertError } = await supabase
    .from('profiles')
    .upsert({ id: session.user.id, username, email: session.user.email ?? '', total_credits: CONFIG.STARTING_CREDITS })
    .select()
    .single();

  if (upsertError) console.error('[auth] profile upsert error:', JSON.stringify(upsertError));
  console.log('[auth] upsert result:', created ? 'created' : 'null');
  return created ?? null;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves true when Supabase established a session immediately, false when
   *  the project requires email confirmation first and the user must verify. */
  signUp: (email: string, password: string, username: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<Profile, 'username' | 'device_push_token'>>) => Promise<void>;
  loadSession: () => Promise<void>;
}

// Register the auth state listener once at module level so it is never duplicated
// regardless of how many times loadSession() is called.
let authListenerRegistered = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,

  loadSession: async () => {
    set({ isLoading: true });

    if (!authListenerRegistered) {
      authListenerRegistered = true;
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          const profile = await fetchOrCreateProfile(session);
          set({ session, profile });
        } else {
          set({ session: null, profile: null });
        }
      });
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const profile = await fetchOrCreateProfile(session);
      set({ session, profile, isLoading: false });
    } else {
      set({ session: null, profile: null, isLoading: false });
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUp: async (email, password, username) => {
    // Pass username in metadata so the on_auth_user_created trigger picks it up.
    // The trigger creates the profile row server-side — no client insert needed.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) throw error;

    // With "Confirm email" enabled (the Supabase default) signUp succeeds but
    // returns no session — the user is not signed in until they click the link.
    // Report that back so the caller can say so, rather than routing into the
    // app and being bounced straight back to sign-in by the root layout.
    return data.session !== null;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    set({ session: null, profile: null });
  },

  updateProfile: async (updates) => {
    const { profile } = get();
    if (!profile) return;
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)
      .select()
      .single();
    if (error) throw error;
    set({ profile: data });
  },
}));
