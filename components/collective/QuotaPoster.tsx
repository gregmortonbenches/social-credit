import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';

interface Props {
  percent: number;
  /** Credits earned this week, and the weekly pool they are measured against. */
  earned: number;
  pool: number;
  /** False until the Collective has any duties this week, so 0% is not read as failure. */
  hasDuties: boolean;
}

const SEGMENTS = 20; // 5% each

/** The line under the bar. The tone follows the quota. */
function statusLine(percent: number, hasDuties: boolean): string {
  if (!hasDuties) return 'NO DUTIES YET. THE QUOTA BEGINS AT THE NEXT ASSIGNMENT.';
  if (percent >= 100) return 'QUOTA FULFILLED. GLORY TO THE COLLECTIVE!';
  if (percent >= 75) return 'THE QUOTA DRAWS NEAR, COMRADES.';
  if (percent >= 50) return 'THE HARVEST IS PLENTIFUL.';
  if (percent >= 25) return 'PRODUCTION CONTINUES. DO NOT SLACKEN.';
  if (percent > 0) return 'THE WORK HAS BEGUN.';
  return 'THE FIELDS AWAIT YOUR LABOUR.';
}

/**
 * The Collective's weekly production quota, drawn as a notice rather than a
 * picture. It replaces the wheat illustration, which never read well: a big
 * stamped number and a segmented bar are legible at a glance and cannot be
 * drawn badly.
 *
 * The bar is 20 segments of 5%, so the level reads by counting; the segment the
 * quota is currently inside is filled partway.
 */
export function QuotaPoster({ percent, earned, pool, hasDuties }: Props) {
  const pct = Math.max(0, Math.min(100, percent));
  const exact = (pct / 100) * SEGMENTS;
  const whole = Math.floor(exact);
  const partial = exact - whole;

  return (
    <View
      style={styles.card}
      accessibilityRole="progressbar"
      accessibilityLabel="Weekly production quota"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <Text style={styles.label}>WEEKLY PRODUCTION QUOTA</Text>

      {/* Credits, not a percentage: a poster counts output against the plan's
          target, it does not show a progress meter. */}
      <Text style={[styles.earned, !hasDuties && styles.earnedIdle]} adjustsFontSizeToFit numberOfLines={1}>
        {earned.toLocaleString()}
      </Text>
      <Text style={styles.earnedOf}>OF {pool.toLocaleString()} CREDITS REQUIRED</Text>

      <View style={styles.bar}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <View key={i} style={styles.segment}>
            {i < whole ? (
              <View style={styles.segmentFill} />
            ) : i === whole && partial > 0 ? (
              <View style={[styles.segmentFill, { width: `${partial * 100}%` }]} />
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.ticks}>
        <Text style={styles.tick}>0</Text>
        <Text style={styles.tick}>THE QUOTA</Text>
      </View>

      <View style={styles.statusRule} />
      <Text style={styles.status}>{statusLine(pct, hasDuties)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 8,
  },
  label: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },
  earned: {
    color: COLORS.primary,
    fontSize: 80,
    lineHeight: 90,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  // Before there is anything to measure, the number should not shout.
  earnedIdle: { opacity: 0.35 },
  earnedOf: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 14,
  },
  bar: {
    flexDirection: 'row',
    gap: 2,
    height: 26,
  },
  segment: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.muted,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  ticks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tick: {
    color: COLORS.muted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: 'SpaceMono',
  },
  statusRule: {
    height: 1,
    backgroundColor: COLORS.primary,
    opacity: 0.5,
    marginTop: 14,
    marginBottom: 12,
  },
  status: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 18,
  },
});
