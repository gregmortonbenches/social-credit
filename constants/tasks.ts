export interface DefaultTask {
  name: string;
  room_type: string;
}

export const DEFAULT_TASKS: DefaultTask[] = [
  { name: 'Take out the bins', room_type: 'hallway' },
  { name: 'Clean the bathroom', room_type: 'bathroom' },
  { name: 'Washing up', room_type: 'kitchen' },
  { name: 'Hoover and mop', room_type: 'living_room' },
  { name: 'General clean', room_type: 'living_room' },
  { name: 'Clean the kitchen', room_type: 'kitchen' },
  { name: 'Clean the bedroom', room_type: 'bedroom' },
  { name: 'Clean living room', room_type: 'living_room' },
  { name: 'Clean the hallway', room_type: 'hallway' },
  { name: 'Clean dining room', room_type: 'dining_room' },
];

// Draft icons — will be replaced with custom artwork later.
const TASK_NAME_ICONS: Record<string, string> = {
  'Take out the bins': 'trash-outline',
  'Clean the bathroom': 'water-outline',
  'Washing up': 'restaurant-outline',
  'Hoover and mop': 'brush-outline',
  'General clean': 'home-outline',
  'Clean the kitchen': 'flame-outline',
  'Clean the bedroom': 'bed-outline',
  'Clean living room': 'tv-outline',
  'Clean the hallway': 'footsteps-outline',
  'Clean dining room': 'fast-food-outline',
};

const ROOM_TYPE_ICONS: Record<string, string> = {
  kitchen: 'flame-outline',
  bathroom: 'water-outline',
  living_room: 'tv-outline',
  dining_room: 'fast-food-outline',
  bedroom: 'bed-outline',
  hallway: 'footsteps-outline',
};

export function getTaskIcon(taskName: string, roomType?: string): string {
  return TASK_NAME_ICONS[taskName] ?? (roomType ? ROOM_TYPE_ICONS[roomType] : undefined) ?? 'checkmark-circle-outline';
}

export const ROOM_TYPES = [
  'kitchen',
  'living_room',
  'dining_room',
  'bathroom',
  'bedroom',
  'hallway',
] as const;

export type RoomType = typeof ROOM_TYPES[number];
