export const PROVERBS = [
  'A clean house is a revolutionary act.',
  'Sweep away the old to make way for the new.',
  'The Collective rises only as high as its lowest comrade.',
  'He who does not labour shall not prosper.',
  'A tidy kitchen feeds a thousand revolutions.',
  'Cleanliness is next to collectivism.',
  'One cannot lead the masses with a dirty floor.',
] as const;

export function getRandomProverb(): string {
  return PROVERBS[Math.floor(Math.random() * PROVERBS.length)];
}
