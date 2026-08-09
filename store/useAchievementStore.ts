import { create } from 'zustand';

interface AchievementState {
  pendingUnlocks: string[];
  pushUnlocks: (keys: string[]) => void;
  clearUnlocks: () => void;
}

export const useAchievementStore = create<AchievementState>((set) => ({
  pendingUnlocks: [],

  pushUnlocks: (keys) =>
    set((state) => ({
      pendingUnlocks: [
        ...state.pendingUnlocks,
        ...keys.filter((k) => !state.pendingUnlocks.includes(k)),
      ],
    })),

  clearUnlocks: () => set({ pendingUnlocks: [] }),
}));
