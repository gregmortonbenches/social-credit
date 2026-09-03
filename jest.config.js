/**
 * Unit tests cover the pure logic that is easiest to get quietly wrong and
 * hardest to notice: timezone arithmetic and the credit/assignment maths.
 *
 * The RLS policies are the other place real damage lives, and they cannot be
 * tested here — they need a real Postgres. `npm run test:db` does that against
 * the actual migration chain; CI runs both.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|date-fns|date-fns-tz))',
  ],
};
