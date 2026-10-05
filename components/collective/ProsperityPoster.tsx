import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { prosperityStage, type WeekProgress } from '../../lib/prosperity';

interface Props {
  /** Consecutive perfect weeks (collectives.prosperity_streak). */
  streak: number;
  week: WeekProgress;
}

const SEGMENTS = 10;

function weeks(n: number): string {
  return `${n} ${n === 1 ? 'WEEK' : 'WEEKS'}`;
}

/** This week's standing against a perfect week, in the poster's voice. */
function weekLine(week: WeekProgress): string {
  if (week.total === 0) return 'NO DUTIES THIS WEEK YET.';
  if (week.overdue > 0) {
    return `${week.overdue} ${week.overdue === 1 ? 'DUTY IS' : 'DUTIES ARE'} OVERDUE. THE STREAK IS IN DANGER.`;
  }
  if (week.done === week.total) return 'ALL DUTIES FULFILLED. THE STREAK HOLDS.';
  return `${week.done} OF ${week.total} DUTIES FULFILLED THIS WEEK.`;
}

/**
 * The Collective's prosperity over many weeks: how long it has gone with every
 * duty done. It is deliberately separate from the weekly credits on the
 * Scoreboard — one failed week and it starts again, which is the point.
 *
 * Not a percentage: it counts weeks, and names the stage reached.
 */
export function ProsperityPoster({ streak, week }: Props) {
  const stage = prosperityStage(streak);
  const filled = Math.floor(stage.progress * SEGMENTS);
  const danger = week.overdue > 0;

  return (
    <View
      style={styles.card}
      accessibilityLabel={`Collective prosperity: ${streak} ${streak === 1 ? 'week' : 'weeks'} of unbroken prosperity`}
    >
      <Text style={styles.label}>PROSPERITY OF THE COLLECTIVE</Text>

      <Text style={styles.streak}>{streak}</Text>
      <Text style={styles.streakOf}>
        {streak === 1 ? 'WEEK' : 'WEEKS'} OF UNBROKEN PROSPERITY
      </Text>

      {stage.current ? <Text style={styles.stage}>{stage.current.name.toUpperCase()}</Text> : null}

      {/* A bar towards the next stage only means something once there is a run
          to measure; at zero it was ten empty boxes of furniture. */}
      {streak > 0 && stage.next ? (
        <>
          <View style={styles.bar}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <View key={i} style={styles.segment}>
                {i < filled ? <View style={styles.segmentFill} /> : null}
              </View>
            ))}
          </View>
          <Text style={styles.next}>
            NEXT: {stage.next.name.toUpperCase()} IN {weeks(stage.weeksToNext ?? 0)}
          </Text>
        </>
      ) : null}

      {streak === 0 ? (
        <Text style={styles.next}>COMPLETE EVERY DUTY THIS WEEK TO BEGIN THE HARVEST.</Text>
      ) : null}

      <View style={styles.rule} />
      <Text style={[styles.weekLine, danger && styles.weekLineDanger]}>{weekLine(week)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  label: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },
  streak: {
    color: COLORS.primary,
    fontSize: 72,
    lineHeight: 80,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  streakOf: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  stage: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 12,
  },
  bar: { flexDirection: 'row', gap: 2, height: 16, marginTop: 12 },
  segment: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.muted,
    overflow: 'hidden',
  },
  segmentFill: { height: '100%', backgroundColor: COLORS.primary },
  next: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
  rule: { height: 1, backgroundColor: COLORS.primary, opacity: 0.4, marginTop: 14, marginBottom: 10 },
  weekLine: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    lineHeight: 16,
  },
  weekLineDanger: { color: COLORS.danger },
});
