import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { selectRealtimeHealthy, useConnectionStore } from '../../store/useConnectionStore';

/**
 * Says when the screen has stopped being live.
 *
 * Offline and "online but the realtime channel dropped" look identical to a
 * user — the data just quietly stops changing — so they are worth
 * distinguishing. Neither state used to be surfaced at all.
 */
export function ConnectionBanner() {
  const isOnline = useConnectionStore((s) => s.isOnline);
  const realtimeHealthy = useConnectionStore(selectRealtimeHealthy);

  if (isOnline && realtimeHealthy) return null;

  const offline = !isOnline;
  return (
    <View
      style={[styles.bar, offline ? styles.barOffline : styles.barStale]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.text, offline ? styles.textOnRed : styles.textOnSurface]}>
        {offline
          ? 'NO CONNECTION — THE COLLECTIVE CANNOT BE REACHED'
          : 'LIVE UPDATES INTERRUPTED — PULL DOWN TO REFRESH'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  barOffline: { backgroundColor: COLORS.danger },
  // Stale-but-online is a weaker signal, so it gets the surface tone with a rule
  // rather than a full-bleed alert colour.
  barStale: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  // Red ground takes white, per the design system's button-text rule; the
  // surface variant keeps body colour.
  textOnRed: { color: '#FFFFFF' },
  textOnSurface: { color: COLORS.text },
});
