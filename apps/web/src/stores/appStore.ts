import { create } from 'zustand'
import type { Household, Bill, Settlement, MemberBalance, SettlementTransfer } from '@/types'
import { calculateBalances } from '@/lib/balance'
import { optimizeSettlements } from '@/lib/settlement'

interface AppState {
  household: Household | null
  bills: Bill[]
  settlements: Settlement[]
  balances: MemberBalance[]
  transfers: SettlementTransfer[]
  isLoading: boolean
  lastSynced: number | null
  /** Monotonic counter bumped by triggerSync. Distinct from lastSynced so a
   *  sync finishing (which sets lastSynced) never re-triggers itself. */
  syncTick: number
}

interface AppActions {
  setHousehold: (household: Household | null) => void
  setBills: (bills: Bill[]) => void
  addBill: (bill: Bill) => void
  updateBill: (bill: Bill) => void
  removeBill: (billId: number) => void
  setSettlements: (settlements: Settlement[]) => void
  addSettlement: (settlement: Settlement) => void
  updateSettlement: (settlement: Settlement) => void
  setLoading: (loading: boolean) => void
  setLastSynced: (ts: number) => void
  /** Request an immediate sync refresh (called after on-chain operations) */
  triggerSync: () => void
  /** Recompute balances and optimal transfer plan from current state */
  recomputeBalances: () => void
  reset: () => void
}

const initial: AppState = {
  household: null,
  bills: [],
  settlements: [],
  balances: [],
  transfers: [],
  isLoading: false,
  lastSynced: null,
  syncTick: 0,
}

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
      ...initial,

      setHousehold: household => set({ household }),

      setBills: bills => {
        set({ bills })
        get().recomputeBalances()
      },

      addBill: bill => {
        set(s => ({ bills: [...s.bills, bill] }))
        get().recomputeBalances()
      },

      updateBill: bill => {
        set(s => ({ bills: s.bills.map(b => (b.id === bill.id ? bill : b)) }))
        get().recomputeBalances()
      },

      removeBill: billId => {
        set(s => ({ bills: s.bills.filter(b => b.id !== billId) }))
        get().recomputeBalances()
      },

      setSettlements: settlements => {
        set({ settlements })
        get().recomputeBalances()
      },

      addSettlement: settlement => {
        set(s => ({ settlements: [...s.settlements, settlement] }))
        get().recomputeBalances()
      },

      updateSettlement: settlement => {
        set(s => ({
          settlements: s.settlements.map(x => (x.id === settlement.id ? settlement : x)),
        }))
        get().recomputeBalances()
      },

      setLoading: isLoading => set({ isLoading }),

      setLastSynced: ts => set({ lastSynced: ts }),

      triggerSync: () => {
        set(s => ({ syncTick: s.syncTick + 1 }))
      },

      recomputeBalances: () => {
        const { household, bills, settlements } = get()
        if (!household) return

        const activeMembers = household.members.filter(m => m.active)
        const addresses = activeMembers.map(m => m.address)
        const nameMap = Object.fromEntries(
          activeMembers.map(m => [m.address, m.displayName]),
        )

        const balances = calculateBalances(addresses, bills, settlements, nameMap)
        const transfers = optimizeSettlements(balances)
        set({ balances, transfers })
      },

      reset: () => set(initial),
    }),
)