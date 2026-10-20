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

export function invalidateTaskLibrary() {
  cache = null;
}

/** A collective's live tasks — what auto-assign hands out and members rank. */
export async function fetchCollectiveTasks(collectiveId: string): Promise<TaskLibraryRow[]> {
  const { data, error } = await supabase
    .from('task_library')
    .select('*')
    .eq('is_custom', true)
    .eq('created_by_collective_id', collectiveId)
    .eq('archived', false)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function addCollectiveTasks(
  collectiveId: string,
  tasks: { action: string; space: string }[],
): Promise<void> {
  if (tasks.length === 0) return;
  const { error } = await supabase.from('task_library').insert(
    tasks.map((t) => ({
      action: t.action,
      space: t.space,
      is_custom: true,
      created_by_collective_id: collectiveId,
    })),
  );
  invalidateTaskLibrary();
  if (error) throw error;
}

export async function archiveCollectiveTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('task_library').update({ archived: true }).eq('id', taskId);
  invalidateTaskLibrary();
  if (error) throw error;
}
