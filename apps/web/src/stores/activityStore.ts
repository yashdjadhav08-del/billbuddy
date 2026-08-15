import { create } from 'zustand'
import type { ActivityItem } from '@/types'

interface ActivityState {
  items: ActivityItem[]
  lastLedger: number | null
  lastSynced: number | null
}

interface ActivityActions {
  setItems: (items: ActivityItem[]) => void
  reset: () => void
}

const initial: ActivityState = {
  items: [],
  lastLedger: null,
  lastSynced: null,
}

/**
 * In-memory (non-persisted) activity feed. Activity is derived from real
 * on-chain Soroban contract events, so it is never faked.
 */
export const useActivityStore = create<ActivityState & ActivityActions>()(set => ({
  ...initial,
  setItems: items => set({ items, lastSynced: Date.now() }),
  reset: () => set(initial),
}))