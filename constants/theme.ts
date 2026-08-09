// Drawn from 1950s Chinese propaganda poster palette — vibrant but period-authentic.
// Each colour is dark enough to carry a white icon at any size.
export const AVATAR_COLORS = [
  '#1B4F8C', // propaganda blue  (sky, Mao jackets)
  '#C87F00', // harvest gold     (wheat, stars)
  '#2B7A2B', // peasant green    (fields, crops)
  '#C14A14', // vermillion       (sunset, warm skin tones)
  '#006B72', // teal             (water, later-era posters)
  '#7A3070', // mauve            (contrast accent)
] as const;

export function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const COLORS = {
  primary: '#CC0000',
  accent: '#000000',
  background: '#F0EAD6',
  surface: '#E8DECA',
  text: '#000000',
  muted: '#7A6A5A',
  success: '#27AE60',
  danger: '#E74C3C',
} as const;

export const TYPOGRAPHY = {
  headerLetterSpacing: 2,
  monoFamily: 'SpaceMono',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 16,
} as const;
