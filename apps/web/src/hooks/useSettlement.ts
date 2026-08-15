import { useCallback, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { stellarService } from '@/services/stellarService'
import { contractService } from '@/services/contractService'
import { useWallet } from './useWallet'
import { friendlyContractError } from '@/lib/contractErrors'
import toast from 'react-hot-toast'
import type { SettlementTransfer, TxState } from '@/types'

export function useSettlement() {
  const { household, addSettlement, updateSettlement, setLoading } = useAppStore()
  const { requireWallet } = useWallet()
  const [txState, setTxState] = useState<TxState>({ status: 'idle', hash: null, error: null })

  const resetTx = useCallback(() => {
    setTxState({ status: 'idle', hash: null, error: null })
  }, [])

  const settleTransfer = useCallback(
    async (transfer: SettlementTransfer) => {
      if (!household) throw new Error('No household loaded')
      const payer = requireWallet()

      if (payer !== transfer.from) {
        throw new Error(`You can only pay your own debts. Expected payer: ${transfer.from}`)
      }

      setTxState({ status: 'building', hash: null, error: null })

      try {
        // 1. Create settlement record on-chain
        setLoading(true)
        const settlement = await contractService.createSettlement(
          household.id,
          payer,
          transfer.to,
          transfer.amount,
        )
        addSettlement(settlement)

        // 2. Sign & submit Stellar payment
        setTxState({ status: 'signing', hash: null, error: null })
        const signedXdr = await stellarService.buildAndSignPayment({
          from: payer,
          to: transfer.to,
          amount: transfer.amount,
          memo: `BillBuddy settlement #${settlement.id}`,
        })

        setTxState({ status: 'submitting', hash: null, error: null })
        const txHash = await stellarService.submitTransaction(signedXdr)

        setTxState({ status: 'confirming', hash: txHash, error: null })

        // 3. Wait for confirmation
        await stellarService.waitForConfirmation(txHash)

        // 4. Mark settlement completed on-chain
        const completed = await contractService.completeSettlement(
          household.id,
          settlement.id,
          payer,
          txHash,
        )
        updateSettlement(completed)

        setTxState({ status: 'success', hash: txHash, error: null })
        toast.success('Settlement completed!')
        return { settlement: completed, txHash }
      } catch (err) {
        const msg = friendlyContractError(err)
        setTxState({ status: 'error', hash: null, error: msg })

        // Attempt to mark settlement as failed on-chain
        try {
          const pubs = useAppStore.getState()
          const pendingSettlement = pubs.settlements.find(
            s => s.payer === payer && s.receiver === transfer.to && s.status === 'pending',
          )
          if (pendingSettlement) {
            const failed = await contractService.failSettlement(
              household.id,
              pendingSettlement.id,
              payer,
            )
            updateSettlement(failed)
          }
        } catch {
          // Best-effort
        }

        toast.error(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [household, requireWallet, addSettlement, updateSettlement, setLoading],
  )

  /**
   * Manually move money from the connected wallet to any account.
   * The sender signs the payment in Freighter, so only their own funds move.
   */
  const sendTransfer = useCallback(
    async (params: { to: string; amount: number; memo?: string }) => {
      if (!household) throw new Error('No household loaded')
      const payer = requireWallet()
      if (params.amount <= 0) throw new Error('Amount must be greater than zero.')
      if (payer === params.to) throw new Error('Sender and recipient cannot be the same account.')

      setTxState({ status: 'signing', hash: null, error: null })
      try {
        const signedXdr = await stellarService.buildAndSignPayment({
          from: payer,
          to: params.to,
          amount: params.amount,
          memo: params.memo,
        })

        setTxState({ status: 'submitting', hash: null, error: null })
        const txHash = await stellarService.submitTransaction(signedXdr)

        setTxState({ status: 'confirming', hash: txHash, error: null })
        await stellarService.waitForConfirmation(txHash)

        setTxState({ status: 'success', hash: txHash, error: null })
        toast.success('Money sent!')
        return { txHash }
      } catch (err) {
        const msg = friendlyContractError(err)
        setTxState({ status: 'error', hash: null, error: msg })
        toast.error(msg)
        throw err
      }
    },
    [household, requireWallet],
  )

  const closePeriod = useCallback(
    async (periodLabel: string) => {
      if (!household) throw new Error('No household loaded')
      const caller = requireWallet()
      setLoading(true)
      try {
        const updated = await contractService.closePeriod(household.id, caller, periodLabel)
        useAppStore.getState().setHousehold(updated)
        toast.success(`${periodLabel} closed!`)
        return updated
      } catch (err) {
        toast.error(friendlyContractError(err))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [household, requireWallet, setLoading],
  )

  return { settleTransfer, sendTransfer, closePeriod, txState, resetTx }
}
