/**
 * Polls the contract for updated state every N seconds.
 * Runs when a household is loaded and the app is visible; also polls the
 * connected wallet's participant bills when no household is loaded (so a
 * selected wallet receives new bills live, straight from shared state).
 *
 * We intentionally only re-run effects when household.id changes — not on
 * every render of syncHousehold — so we use a stable ref for the callback.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useHousehold } from './useHousehold'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { contractService } from '@/services/contractService'

const POLL_INTERVAL_MS = 15_000 // 15 s

export function useSync() {
  const { household } = useAppStore()
  const { syncHousehold } = useHousehold()
  const publicKey = useWalletStore(s => s.publicKey)
  const syncTick = useAppStore(s => s.syncTick)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const syncRef = useRef(syncHousehold)
  syncRef.current = syncHousehold

  const householdId = household?.id

  // Immediate sync trigger (called after on-chain operations like transfers).
  // Watches syncTick (a counter) instead of lastSynced so that a finished sync
  // updating lastSynced never re-triggers an endless refresh loop.
  const prevTick = useRef(syncTick)
  useEffect(() => {
    if (householdId && syncTick !== prevTick.current) {
      prevTick.current = syncTick
      void syncRef.current()
    }
  }, [syncTick, householdId])

  // Polling effect — restarts whenever the active household changes
  useEffect(() => {
    if (!householdId) return

    void syncRef.current()

    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncRef.current()
      }
    }, POLL_INTERVAL_MS)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [householdId])

  // Participant-only polling: when the wallet has no household loaded, still
  // live-fetch bills it was selected into, so a bill created by another wallet
  // appears here without relying on any local/browser storage.
  useEffect(() => {
    if (householdId) return
    if (!publicKey) return

    const pollMemberBills = () => {
      if (document.visibilityState !== 'visible') return
      contractService
        .getBillsForMember(publicKey)
        .then(bills => useAppStore.getState().setBills(bills))
        .catch(err => {
          // Silently fail — user data stays as-is from cache
          console.debug('Member bill poll failed:', err)
        })
    }

    pollMemberBills()
    const t = setInterval(pollMemberBills, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [householdId, publicKey])

  // Also sync when the tab becomes visible again
  const handleVisibility = useCallback(() => {
    if (document.visibilityState === 'visible' && householdId) {
      void syncRef.current()
    }
  }, [householdId])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [handleVisibility])
}
