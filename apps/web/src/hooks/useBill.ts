import { useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { contractService } from '@/services/contractService'
import { useWallet } from './useWallet'
import { formatCents } from '@/lib/money'
import toast from 'react-hot-toast'
import type { BillCategory, MemberContribution, MemberShare, SplitType } from '@/types'

export interface CreateBillInput {
  title: string
  category: BillCategory
  totalAmount: number
  dueDate: number
  splitType: SplitType
  shares: MemberShare[]
  contributions: MemberContribution[]
}

export function useBill() {
  const { household, addBill, updateBill: storeupdateBill, setLoading } = useAppStore()
  const { requireWallet } = useWallet()

  const createBill = useCallback(
    async (input: CreateBillInput) => {
      if (!household) throw new Error('No household loaded')
      const creator = requireWallet()
      setLoading(true)
      try {
        const bill = await contractService.createBill(household.id, creator, input)
        addBill(bill)
        toast.success(`"${input.title}" added`)
        return bill
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create bill'
        toast.error(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [household, requireWallet, addBill, setLoading],
  )

  const updateBill = useCallback(
    async (billId: number, input: CreateBillInput) => {
      if (!household) throw new Error('No household loaded')
      const caller = requireWallet()
      setLoading(true)
      try {
        const bill = await contractService.updateBill(household.id, billId, caller, input)
        storeupdateBill(bill)
        toast.success('Bill updated')
        return bill
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update bill'
        toast.error(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [household, requireWallet, storeupdateBill, setLoading],
  )

  /**
   * Pay the connected wallet's outstanding share of a bill. Builds a real
   * Soroban `pay_bill` transaction signed via Freighter; only after on-chain
   * confirmation does the bill flip to paid and balances update.
   */
  const payBill = useCallback(
    async (billId: number, expectedAmount?: number) => {
      const payer = requireWallet()
      const bill = useAppStore.getState().bills.find(b => b.id === billId)
      if (!bill) throw new Error('Bill not found')

      const share = bill.shares.find(s => s.member === payer)
      if (!share) {
        throw new Error('You are not a participant of this bill')
      }
      const contribution = bill.contributions.find(c => c.member === payer)?.amount ?? 0
      const outstanding = share.amount - contribution
      if (outstanding <= 0) throw new Error('You already paid your share of this bill')
      if (expectedAmount && expectedAmount !== outstanding) {
        throw new Error('The amount you owe on this bill changed. Refresh and try again.')
      }

      setLoading(true)
      try {
        const updated = await contractService.payBill(
          bill.householdId,
          bill.id,
          payer,
          outstanding,
        )
        storeupdateBill(updated)
        toast.success(`You paid ${formatCents(outstanding)} for "${bill.title}"`)
        return updated
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Payment failed'
        toast.error(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [requireWallet, storeupdateBill, setLoading],
  )

  /**
   * Delete a bill from shared state. Only the bill creator or the household
   * owner may delete; settled bills are locked on the contract.
   */
  const deleteBill = useCallback(
    async (billId: number) => {
      const caller = requireWallet()
      const bill = useAppStore.getState().bills.find(b => b.id === billId)
      if (!bill) throw new Error('Bill not found')

      setLoading(true)
      try {
        await contractService.deleteBill(bill.householdId, bill.id, caller)
        useAppStore.getState().removeBill(bill.id)
        toast.success(`"${bill.title}" deleted`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete bill'
        toast.error(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [requireWallet, setLoading],
  )

  return { createBill, updateBill, payBill, deleteBill }
}
