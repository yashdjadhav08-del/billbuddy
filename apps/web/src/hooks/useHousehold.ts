import { useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { useActivityStore } from '@/stores/activityStore'
import { contractService } from '@/services/contractService'
import { fetchContractEvents, describeEvents } from '@/services/activityService'
import { friendlyContractError } from '@/lib/contractErrors'
import { useWallet } from './useWallet'
import toast from 'react-hot-toast'
import type { Member } from '@/types'

export function useHousehold() {
  const { household, setHousehold, setBills, setSettlements, setLoading, setLastSynced } =
    useAppStore()
  const { requireWallet } = useWallet()

  const setActivity = useActivityStore(s => s.setItems)

  const createHousehold = useCallback(
    async (name: string) => {
      const owner = requireWallet()
      setLoading(true)
      try {
        const hh = await contractService.createHousehold(name, owner)
        setHousehold(hh)
        toast.success(`Household "${name}" created`)
        return hh
      } catch (err) {
        toast.error(friendlyContractError(err))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [requireWallet, setHousehold, setLoading],
  )

  const addMember = useCallback(
    async (address: string, displayName: string) => {
      if (!household) throw new Error('No household loaded')
      const caller = requireWallet()
      setLoading(true)
      try {
        const updated = await contractService.addMember(
          household.id,
          caller,
          address,
          displayName,
        )
        setHousehold(updated)
        toast.success(`${displayName} added`)
        return updated
      } catch (err) {
        toast.error(friendlyContractError(err))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [household, requireWallet, setHousehold, setLoading],
  )

  const removeMember = useCallback(
    async (memberAddress: string) => {
      if (!household) throw new Error('No household loaded')
      const caller = requireWallet()
      setLoading(true)
      try {
        const member = household.members.find(m => m.address === memberAddress)
        const updated = await contractService.removeMember(
          household.id,
          caller,
          memberAddress,
        )
        setHousehold(updated)
        toast.success(`${member?.displayName ?? 'Member'} removed`)
        return updated
      } catch (err) {
        toast.error(friendlyContractError(err))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [household, requireWallet, setHousehold, setLoading],
  )

  /**
   * Load an existing household by its numeric ID and set it as the active one.
   * The connected wallet must be an active member, otherwise the contract
   * exposes no mechanism to pull arbitrary households into the shared ledger.
   * This is the recovery path for the "duplicate house" confusion: a wallet
   * that was added to house #1 but whose discovery surfaced a different one
   * can jump straight back to the shared house by ID.
   */
  const joinHousehold = useCallback(
    async (id: number) => {
      const caller = requireWallet()
      setLoading(true)
      try {
        const hh = await contractService.getHousehold(id)
        const amMember = hh.members.some(m => m.address === caller && m.active)
        if (!amMember) {
          throw new Error(
            `You are not an active member of household #${id}. Ask the owner to add you first.`,
          )
        }
        const [bills, settlements] = await Promise.all([
          contractService.getBills(id),
          contractService.getSettlements(id),
        ])
        setHousehold(hh)
        setBills(bills)
        setSettlements(settlements)
        toast.success(`Joined "${hh.name}" (household #${id})`)
        return hh
      } catch (err) {
        toast.error(friendlyContractError(err))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [requireWallet, setHousehold, setBills, setSettlements, setLoading],
  )

  const syncHousehold = useCallback(async () => {
    if (!household) return
    setLoading(true)
    try {
      const [hh, bills, settlements] = await Promise.all([
        contractService.getHousehold(household.id),
        contractService.getBills(household.id),
        contractService.getSettlements(household.id),
      ])
      setHousehold(hh)
      setBills(bills)
      setSettlements(settlements)

      // Also pull any bills this wallet was selected into from shared state
      // (participant discovery across households) and merge them in.
      const publicKey = useWalletStore.getState().publicKey
      if (publicKey) {
        const memberBills = await contractService.getBillsForMember(publicKey)
        const merged = contractService.mergeBills(bills, memberBills)
        if (merged.length !== bills.length) setBills(merged)
      }

      setLastSynced(Date.now())
    } catch (err) {
      // Silent sync failures — user data still shown from cache
      console.error('Sync failed:', err)
    } finally {
      setLoading(false)
    }

    // Pull real on-chain contract events for the activity feed.
    try {
      const raw = await fetchContractEvents()
      const mine = raw.filter(e => e.householdId === household.id)
      const items = describeEvents(
        mine,
        household.members.map(m => ({ address: m.address, displayName: m.displayName })),
      )
      setActivity(items)
    } catch {
      // Activity feed is best-effort; never block normal sync on it.
    }
  }, [household, setHousehold, setBills, setSettlements, setLoading, setLastSynced, setActivity])

  const activeMember = household?.members.find(
    m => m.active && m.address === useAppStore.getState().household?.owner,
  ) as Member | undefined

  return {
    household,
    createHousehold,
    addMember,
    removeMember,
    joinHousehold,
    syncHousehold,
    activeMember,
  }
}