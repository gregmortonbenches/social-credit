import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On web the client falls back to localStorage, so a refresh keeps you in.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // OAuth returns an authorisation code that lib/oauth.ts exchanges by hand
    // after the auth browser closes. PKCE is what makes that exchange safe on a
    // device that cannot keep a client secret.
    flowType: 'pkce',
  },
});
