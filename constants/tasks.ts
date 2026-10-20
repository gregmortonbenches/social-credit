// A task is an action from this fixed list plus a space the household types
// themselves. The database composes the display name ("Mop: Kitchen") — see
// migration 021 — so the list here and the CASE in task_library_compose() must
// stay in step.
export const TASK_ACTIONS = [
  { key: 'clean', label: 'Clean', icon: 'sparkles-outline' },
  { key: 'mop', label: 'Mop', icon: 'water-outline' },
  { key: 'hoover', label: 'Hoover', icon: 'brush-outline' },
  { key: 'wash_up', label: 'Wash up', icon: 'restaurant-outline' },
  { key: 'tidy', label: 'Tidy', icon: 'home-outline' },
  { key: 'bins', label: 'Bins', icon: 'trash-outline' },
] as const;

export type TaskAction = (typeof TASK_ACTIONS)[number]['key'];

export const SPACE_MAX_CHARS = 30;

export function getActionLabel(action: string): string {
  return TASK_ACTIONS.find((a) => a.key === action)?.label ?? action;
}

// Draft icons — will be replaced with custom artwork later.
export function getTaskIcon(action?: string | null): string {
  return TASK_ACTIONS.find((a) => a.key === action)?.icon ?? 'checkmark-circle-outline';
}

export function normaliseSpace(space: string): string {
  return space.trim().replace(/\s+/g, ' ');
}
