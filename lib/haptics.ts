import * as Haptics from 'expo-haptics';

// Thin wrapper so a missing haptic engine (web, some Android devices, a
// simulator) never turns into an unhandled rejection in a gesture handler.
const safe = (fn: () => Promise<void>) => {
  fn().catch(() => {});
};

export const haptics = {
  /** Picking something up. */
  grab: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Crossing a boundary, e.g. a dragged row passing into the next slot. */
  tick: () => safe(() => Haptics.selectionAsync()),
  /** A small confirmation: adding, removing, undoing. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A task done, a thing saved. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
