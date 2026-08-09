export type AchievementCategory = 'cleaning' | 'longevity' | 'interaction' | 'collective';

export type AchievementTriggerType =
  | 'task_complete'
  | 'denounce_made'
  | 'denounce_resolved'
  | 'vote_cast'
  | 'draft_complete'
  | 'member_joined'
  | 'holiday_returned'
  | 'none';

export interface Achievement {
  key: string;
  title: string;
  description: string;
  category: AchievementCategory;
  triggerType: AchievementTriggerType;
}

export const ACHIEVEMENTS: Achievement[] = [
  // --- Cleaning (1–10) ---
  {
    key: 'class_struggle',
    title: 'Class Struggle',
    description: 'Complete your first task for the Collective.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'westward_expansion',
    title: 'The Westward Expansion',
    description: 'Complete a task in every room type available in your Collective.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'eastward_expansion',
    title: 'The Eastward Expansion',
    description: 'Complete 5 tasks in a single room type.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'struggle_sessions',
    title: 'Struggle Sessions',
    description: 'Complete 3 tasks in the same week.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'hero_of_the_people',
    title: 'Hero of the People',
    description: 'Finish top of the weekly scoreboard.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'backyard_furnace',
    title: 'Backyard Furnace',
    description: 'Complete 10 kitchen tasks across all weeks.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'iron_rice_bowl',
    title: 'The Iron Rice Bowl',
    description: 'Complete every assigned task for 4 consecutive weeks.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'reeducation_through_labour',
    title: 'Re-education through Labour',
    description: 'Win a denouncement appeal by the Collective voting to dismiss.',
    category: 'cleaning',
    triggerType: 'denounce_resolved',
  },
  {
    key: 'hundred_flowers',
    title: 'The Hundred Flowers Campaign',
    description: 'Have a custom task you proposed accepted and assigned.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },
  {
    key: 'ten_great_constructions',
    title: 'The Ten Great Constructions',
    description: 'Complete 10 tasks total across all weeks.',
    category: 'cleaning',
    triggerType: 'task_complete',
  },

  // --- Longevity (11–20) ---
  {
    key: 'long_march',
    title: 'The Long March',
    description: 'Complete tasks every week for 6 consecutive weeks.',
    category: 'longevity',
    triggerType: 'task_complete',
  },
  {
    key: 'peoples_communes',
    title: "People's Communes",
    description: 'Be an active member of your Collective for 1 month.',
    category: 'longevity',
    triggerType: 'member_joined',
  },
  {
    key: 'production_team',
    title: 'Production Team',
    description: 'Participate in 3 weekly drafts.',
    category: 'longevity',
    triggerType: 'draft_complete',
  },
  {
    key: 'three_anti_campaign',
    title: 'The Three-Anti Campaign',
    description: 'Avoid being denounced for 3 consecutive weeks.',
    category: 'longevity',
    triggerType: 'task_complete',
  },
  {
    key: 'gang_of_four',
    title: 'The Gang of Four',
    description: 'Be a member of a Collective with at least 4 members.',
    category: 'longevity',
    triggerType: 'member_joined',
  },
  {
    key: 'five_year_plan',
    title: 'Five-year Plan',
    description: 'Complete tasks in 5 consecutive weekly cycles.',
    category: 'longevity',
    triggerType: 'task_complete',
  },
  {
    key: 'production_brigade',
    title: 'Production Brigade',
    description: 'Participate in 10 weekly drafts.',
    category: 'longevity',
    triggerType: 'draft_complete',
  },
  {
    key: 'land_reform',
    title: 'Land Reform',
    description: 'Return from a holiday pause and complete all tasks in your first week back.',
    category: 'longevity',
    triggerType: 'holiday_returned',
  },
  {
    key: 'continuous_revolution',
    title: 'Continuous Revolution',
    description: 'Never miss a task for 8 consecutive weeks.',
    category: 'longevity',
    triggerType: 'task_complete',
  },
  {
    key: 'sino_soviet_split',
    title: 'The Sino-Soviet Split',
    description: 'Leave one Collective and join another.',
    category: 'longevity',
    triggerType: 'member_joined',
  },

  // --- Interaction (21–30) ---
  {
    key: 'know_the_enemy',
    title: 'Know the Enemy',
    description: 'Be the accused in a denouncement.',
    category: 'interaction',
    triggerType: 'denounce_resolved',
  },
  {
    key: 'purge_the_bourgeoisie',
    title: 'Purge the Bourgeoisie',
    description: 'Successfully denounce a Comrade (upheld outcome).',
    category: 'interaction',
    triggerType: 'denounce_made',
  },
  {
    key: 'planned_economy',
    title: 'Planned Economy',
    description: 'Draft all your tasks before anyone else in a week.',
    category: 'interaction',
    triggerType: 'draft_complete',
  },
  {
    key: 'cultural_revolution',
    title: 'Cultural Revolution',
    description: 'Be involved in 5 denouncements (as accuser or accused).',
    category: 'interaction',
    triggerType: 'denounce_resolved',
  },
  {
    key: 'party_leadership',
    title: 'Party Leadership',
    description: 'Hold the most credits in your Collective for 3 consecutive weeks.',
    category: 'interaction',
    triggerType: 'task_complete',
  },
  {
    key: 'workers_faculties',
    title: "Worker's Faculties",
    description: 'Submit a defence explanation that results in a dismissed denouncement.',
    category: 'interaction',
    triggerType: 'denounce_resolved',
  },
  {
    key: 'united_front',
    title: 'United Front',
    description: 'Vote in 5 denouncement proceedings.',
    category: 'interaction',
    triggerType: 'vote_cast',
  },
  {
    key: 'self_reliance',
    title: 'Self-reliance',
    description: 'Complete a task you proposed yourself.',
    category: 'interaction',
    triggerType: 'task_complete',
  },
  {
    key: 'patriotic_war',
    title: 'Patriotic War',
    description: 'Have a denouncement against you dismissed by unanimous vote.',
    category: 'interaction',
    triggerType: 'denounce_resolved',
  },
  {
    key: 'double_agents',
    title: 'Double Agents',
    description: 'Denounce the same Comrade who previously denounced you.',
    category: 'interaction',
    triggerType: 'denounce_made',
  },

  // --- Collective (31–40) ---
  {
    key: 'rally_the_peasants',
    title: 'Rally the Peasants',
    description: 'Invite a new member who joins your Collective.',
    category: 'collective',
    triggerType: 'member_joined',
  },
  {
    key: 'collectivisation',
    title: 'Collectivisation',
    description: 'Your Collective reaches 100% of the weekly credit quota.',
    category: 'collective',
    triggerType: 'task_complete',
  },
  {
    key: 'mass_line',
    title: 'Mass Line',
    description: 'All members of your Collective vote in the same denouncement.',
    category: 'collective',
    triggerType: 'vote_cast',
  },
  {
    key: 'household_responsibility',
    title: 'Household Responsibility System',
    description: 'Every member completes all their tasks in the same week.',
    category: 'collective',
    triggerType: 'task_complete',
  },
  {
    key: 'socialist_realism',
    title: 'Socialist Realism',
    description: '(Placeholder — trigger not yet implemented.)',
    category: 'collective',
    triggerType: 'none',
  },
  {
    key: 'young_pioneers',
    title: 'Young Pioneers',
    description: 'Be the first member to complete a task in a brand-new Collective.',
    category: 'collective',
    triggerType: 'task_complete',
  },
  {
    key: 'propaganda',
    title: 'Propaganda',
    description: 'Share your Collective invite link.',
    category: 'collective',
    triggerType: 'member_joined',
  },
  {
    key: 'special_economic_zones',
    title: 'Special Economic Zones',
    description: '(Future: inter-collective achievement — placeholder.)',
    category: 'collective',
    triggerType: 'none',
  },
  {
    key: 'reform_and_opening_up',
    title: 'Reform and Opening Up',
    description: '(Future: inter-collective achievement — placeholder.)',
    category: 'collective',
    triggerType: 'none',
  },
  {
    key: 'four_modernisations',
    title: 'Four Modernisations',
    description: 'Unlock at least one achievement in each category.',
    category: 'collective',
    triggerType: 'task_complete',
  },
];

export const ACHIEVEMENTS_BY_KEY = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.key, a])
) as Record<string, Achievement>;
