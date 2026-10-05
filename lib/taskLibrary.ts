import { supabase } from './supabase';
import type { TaskLibrary as TaskLibraryRow } from './database.types';

// The library is a handful of rows that almost never change, but the Tasks and
// Collective panels each fetched it on every mount. Share one request between
// them, and reuse the result briefly. Pull-to-refresh passes `force`.
const TTL_MS = 60_000;

let cache: { rows: TaskLibraryRow[]; at: number } | null = null;
let inFlight: Promise<TaskLibraryRow[]> | null = null;

export async function fetchTaskLibrary(force = false): Promise<TaskLibraryRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data, error } = await supabase.from('task_library').select('*');
    if (error) throw error;
    cache = { rows: data ?? [], at: Date.now() };
    return cache.rows;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
