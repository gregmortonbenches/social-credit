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

// Contrast note (WCAG 2.1 AA: 4.5:1 for text below 14pt bold / 18pt regular).
// `muted`, `danger` and `success` all appear at 11-13px, so each is held to 4.5
// against BOTH grounds — `surface` is the harder of the two and sets the value.
//   muted   #6F6052  4.53 on surface, 5.03 on background  (was #7A6A5A: 3.90 / 4.32)
//   danger  #BD2717  4.54 on surface, 5.03 on background  (was #E74C3C: 2.86 / 3.17)
//   success #19713E  4.53 on surface, 5.02 on background  (was #27AE60: 2.15 / 2.39)
// Each is the smallest darkening of the original that clears the threshold, so
// the hues are unchanged.
//
// `primary` is deliberately NOT adjusted: it is the brand red fixed by decision
// 15. It passes on `background` (4.89) but sits just under on `surface` (4.41),
// which affects red-on-surface section headers such as COMRADE STANDINGS. If you
// want that to clear AA too, #C20000 does it (4.78 on surface, 5.30 on
// background, 6.38 for white-on-red) and is visually indistinguishable — but it
// is a brand decision, not an accessibility one, so it is left to you.
export const COLORS = {
  primary: '#CC0000',
  accent: '#000000',
  background: '#F0EAD6',
  surface: '#E8DECA',
  text: '#000000',
  muted: '#6F6052',
  success: '#19713E',
  danger: '#BD2717',
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
