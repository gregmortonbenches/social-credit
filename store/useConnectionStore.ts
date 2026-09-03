import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

/**
 * Connection health, for telling the user when what they are looking at has
 * stopped being live.
 *
 * Two separate things go wrong and they need different words:
 *
 *   - The device is offline. Nothing will load or save at all.
 *   - The device is online but a realtime channel has dropped. Everything
 *     already on screen is stale and will silently stay stale, because none of
 *     the four .subscribe() calls used to inspect their status callback — a
 *     channel that died stayed dead until something re-mounted it.
 */
interface ConnectionState {
  isOnline: boolean;
  /** Channel topic -> healthy. Anything other than SUBSCRIBED is unhealthy. */
  channels: Record<string, boolean>;
  setChannelStatus: (name: string, healthy: boolean) => void;
  forgetChannel: (name: string) => void;
  /** Begin watching device connectivity. Returns an unsubscribe. */
  startWatching: () => () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  // Assume connected until told otherwise, so the banner never flashes on a
  // cold start before NetInfo has reported.
  isOnline: true,
  channels: {},

  setChannelStatus: (name, healthy) =>
    set((state) =>
      state.channels[name] === healthy
        ? state
        : { channels: { ...state.channels, [name]: healthy } }
    ),

  forgetChannel: (name) =>
    set((state) => {
      if (!(name in state.channels)) return state;
      const next = { ...state.channels };
      delete next[name];
      return { channels: next };
    }),

  startWatching: () =>
    NetInfo.addEventListener((s) => {
      // isInternetReachable is null while unknown; only trust an explicit false.
      const online = s.isConnected !== false && s.isInternetReachable !== false;
      set({ isOnline: online });
    }),
}));

/** True when every registered channel is subscribed. */
export function selectRealtimeHealthy(s: ConnectionState): boolean {
  return Object.values(s.channels).every(Boolean);
}
