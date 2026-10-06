export const CONFIG = {
  STARTING_CREDITS: 500,
  WEEKLY_CREDIT_POOL: 1000,

  DENOUNCE_ACCUSER_REWARD: 100,
  DENOUNCE_ACCUSER_PENALTY: 50,
  DENOUNCE_TWO_PERSON_ABUSE_THRESHOLD: 3,
  DENOUNCE_TWO_PERSON_ABUSE_PENALTY: 150,
  DENOUNCE_TWO_PERSON_WINDOW_DAYS: 60,
  DENOUNCE_RESPONSE_WINDOW_HOURS: 24,
  DENOUNCE_VOTE_WINDOW_HOURS: 24,  // after the accused responds; jurors who have not voted by then are ignored
  DENOUNCE_EXPLANATION_MAX_WORDS: 300,

  AUTO_ASSIGN_HOUR: 14,  // Sunday, collective timezone — when weekly auto-assignment runs

  COLLECTIVE_CODE_LENGTH: 5,
  COLLECTIVE_NAME_MAX_CHARS: 30,

  // Task due dates (collective timezone)
  DEFAULT_TASK_DUE_DAY: 0,        // 0 = Sunday — the weekly backstop
  DEFAULT_TASK_DUE_HOUR: 23,
  DEFAULT_TASK_DUE_MINUTE: 59,
  // When true, auto-assign spreads each member's tasks across the week instead
  // of dropping all of them on the backstop day. Members can then move any
  // individual task to another day of the same week (reschedule_assignment).
  STAGGER_TASK_DUE_DATES: true,

  // Collective prosperity: consecutive weeks in which every duty was completed.
  // A failed week resets the streak to zero (weekly-reset, migration 019). These
  // are the named stages the Collective page counts towards — display only.
  PROSPERITY_MILESTONES: [
    { weeks: 1, name: 'The First Harvest' },
    { weeks: 4, name: "The People's Commune" },
    { weeks: 12, name: 'The Five-Year Plan' },
    { weeks: 26, name: 'The Great Leap Forward' },
    { weeks: 52, name: 'The Golden Age' },
  ],

  // Where the published Privacy Policy and Terms live. Drafts are in docs/.
  // While these are empty the sign-up consent text renders as plain words rather
  // than links, so it never appears to offer a document that does not exist.
  PRIVACY_POLICY_URL: '',
  TERMS_URL: '',
} as const;
