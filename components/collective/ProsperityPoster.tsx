import { StyleSheet, Text, View } from 'react-native';
import { CollectiveConstruction } from './CollectiveConstruction';
import { COLORS } from '../../constants/theme';
import { prosperityStage, type WeekProgress } from '../../lib/prosperity';

interface Props {
  /** Consecutive perfect weeks (collectives.prosperity_streak). */
  streak: number;
  week: WeekProgress;
}

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
  const danger = week.overdue > 0;

  return (
    <View
      style={styles.card}
      accessibilityLabel={`Collective prosperity: ${streak} ${streak === 1 ? 'week' : 'weeks'} of unbroken prosperity. ${
        stage.next ? `Building towards ${stage.next.name}.` : 'Every stage of prosperity has been built.'
      }`}
    >
      <Text style={styles.label}>PROSPERITY OF THE COLLECTIVE</Text>

      <Text style={styles.streak}>{streak}</Text>
      <Text style={styles.streakOf}>
        {streak === 1 ? 'WEEK' : 'WEEKS'} OF UNBROKEN PROSPERITY
      </Text>

      {stage.current ? <Text style={styles.stage}>{stage.current.name.toUpperCase()}</Text> : null}

      {/* The skyline itself carries the progress — what's standing is the streak
          made visible, and the scaffold mid-frame is how close the next stage is.
          A missed week sends the whole thing back to bare ground (decision 47:
          the streak resets wholesale, not one building at a time), which the
          illustration shows on its own with no separate "0" state needed. */}
      <View style={styles.construction}>
        <CollectiveConstruction streak={streak} />
      </View>

      {stage.next ? (
        <Text style={styles.next}>
          {streak === 0
            ? 'GROUND HAS BEEN BROKEN. COMPLETE EVERY DUTY THIS WEEK TO RAISE THE FIRST HARVEST.'
            : `NEXT: ${stage.next.name.toUpperCase()} IN ${weeks(stage.weeksToNext ?? 0)}`}
        </Text>
      ) : (
        <Text style={styles.next}>THE GOLDEN AGE STANDS COMPLETE.</Text>
      )}

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
  construction: {
    width: '100%',
    height: 130,
    marginTop: 14,
  },
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
