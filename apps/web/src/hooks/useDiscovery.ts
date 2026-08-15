/**
 * Cross-wallet household discovery.
 *
 * In real (non-mock) mode the household, bills and settlements all live in the
 * shared Soroban contract. When a wallet connects and has no household loaded —
 * e.g. Wallet B opening the app for the first time after Wallet A created the
 * household and added them — this hook queries the contract for every household
 * the user is a member of and loads it, exactly like a fresh client joining a
 * shared ledger.
 *
 * In mock mode the shared mock-server state is used instead (see App.tsx).
 */
import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { contractService } from '@/services/contractService'
import { config } from '@/config/env'
import type { Bill } from '@/types'

export function useDiscovery() {
  const { household, setHousehold, setBills, setSettlements, setLoading } = useAppStore()
  const publicKey = useWalletStore(s => s.publicKey)
  const status = useWalletStore(s => s.status)
  const loadingRef = useRef(false)

  const discover = useCallback(async () => {
    if (status !== 'connected' || !publicKey) return
    if (config.flags.mockMode) return // mock bootstrap already syncs shared state
    if (!config.contracts.billbuddyContractId) return
    if (loadingRef.current) return

    loadingRef.current = true
    setLoading(true)
    try {
      const ids = await contractService.getUserHouseholds(publicKey)

      // Shared-state discovery by wallet address: every bill this wallet was
      // selected into, across ALL households — even if not a member of one.
      const memberBills = await contractService.getBillsForMember(publicKey)

      if (ids.length === 0 && memberBills.length === 0) return

      let hh: Awaited<ReturnType<typeof contractService.getHousehold>> | null = null
      let settlements: Awaited<ReturnType<typeof contractService.getSettlements>> = []
      let householdBills: Bill[] = []

      if (ids.length > 0) {
        // Load the most recent household the user belongs to.
        const id = ids[0]
        ;[hh, householdBills, settlements] = await Promise.all([
          contractService.getHousehold(id),
          contractService.getBills(id),
          contractService.getSettlements(id),
        ])
      }

      const bills = contractService.mergeBills(householdBills, memberBills)
      setHousehold(hh)
      setBills(bills)
      setSettlements(settlements)
    } catch (err) {
      console.error('Household discovery failed:', err)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [status, publicKey, setHousehold, setBills, setSettlements, setLoading])

  useEffect(() => {
    if (status !== 'connected' || !publicKey) return
    if (loadingRef.current) return

    const current = useAppStore.getState().household
    if (current) {
      // Loaded household must actually belong to the connected wallet.
      const amMember = current.members.some(m => m.address === publicKey && m.active)
      if (amMember) return
    }
    void discover()
  }, [status, publicKey, household?.id, discover])
}