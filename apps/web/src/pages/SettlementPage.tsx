import { useState } from 'react'
import {
  ExternalLink,
  ArrowRight,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowLeftRight,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { StatusDot } from '@/components/ui/status-dot'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSettlement } from '@/hooks/useSettlement'
import { formatCents, shortenAddress, toCents } from '@/lib/money'
import { getExplorerTxUrl } from '@/config/env'
import { currentPeriodLabel } from '@/lib/utils'
import { allSettled } from '@/lib/balance'
import type { SettlementTransfer, TxState } from '@/types'
import type { Member } from '@/types'

// ─── TX Progress Modal ────────────────────────────────────────────────────────

const TX_STEPS: { status: TxState['status']; label: string }[] = [
  { status: 'building',    label: 'Building transaction' },
  { status: 'signing',     label: 'Waiting for Freighter signature' },
  { status: 'submitting',  label: 'Submitting to Stellar' },
  { status: 'confirming',  label: 'Waiting for confirmation' },
  { status: 'success',     label: 'Confirmed on-chain' },
]

function TxProgressModal({
  open,
  txState,
  transfer,
  onClose,
}: {
  open: boolean
  txState: TxState
  transfer: SettlementTransfer | null
  onClose: () => void
}) {
  const currentStep = TX_STEPS.findIndex(s => s.status === txState.status)
  const progress = txState.status === 'success'
    ? 100
    : txState.status === 'idle'
    ? 0
    : Math.round(((currentStep + 1) / TX_STEPS.length) * 90)
  const isManual = transfer && !transfer.fromName

  return (
    <Dialog open={open} onOpenChange={open => !open && txState.status !== 'signing' && txState.status !== 'submitting' && txState.status !== 'confirming' && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {txState.status === 'success'
              ? (isManual ? '✓ Money Sent' : '✓ Settlement Complete')
              : txState.status === 'error'
              ? (isManual ? 'Transfer Failed' : 'Settlement Failed')
              : 'Processing Payment'}
          </DialogTitle>
          {transfer && (
            <DialogDescription>
              {isManual
                ? `You → ${shortenAddress(transfer.to, 4, 4)} · ${formatCents(transfer.amount)}`
                : `${transfer.fromName} → ${transfer.toName} · ${formatCents(transfer.amount)}`}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Progress value={progress} className={txState.status === 'error' ? '[&>div]:bg-red-500' : ''} />

          <div className="space-y-3">
            {TX_STEPS.filter(s => s.status !== 'idle').map((step, _i) => {
              const stepIndex = TX_STEPS.findIndex(s2 => s2.status === step.status)
              const isDone    = currentStep > stepIndex || txState.status === 'success'
              const isActive  = stepIndex === currentStep && txState.status !== 'success' && txState.status !== 'error'
              const isFuture  = stepIndex > currentStep && txState.status !== 'success'

              return (
                <div key={step.status} className={`flex items-center gap-3 transition-opacity ${isFuture && txState.status !== 'error' ? 'opacity-30' : ''}`}>
                  <div className="flex-shrink-0">
                    {isDone
                      ? <CheckCircle className="h-5 w-5 text-emerald-500" aria-label="Done" />
                      : isActive
                      ? <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" aria-label="In progress" />
                      : <div className="h-5 w-5 rounded-full border-2 border-slate-200" aria-hidden="true" />
                    }
                  </div>
                  <span className={`text-sm ${isActive ? 'font-semibold text-slate-800' : isDone ? 'text-slate-500' : 'text-slate-300'}`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>

          {txState.status === 'error' && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4">
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Transaction rejected</p>
                  <p className="text-xs text-red-600 mt-1">{txState.error}</p>
                  <p className="text-xs text-slate-400 mt-1">No funds were transferred.</p>
                </div>
              </div>
            </div>
          )}

          {txState.status === 'success' && txState.hash && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
              <p className="text-sm font-semibold text-emerald-700">SettlementCompleted ✓</p>
              <p className="text-xs text-slate-500 font-mono break-all">{txState.hash}</p>
              <a
                href={getExplorerTxUrl(txState.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View on Stellar Explorer
              </a>
            </div>
          )}
        </div>

        {(txState.status === 'success' || txState.status === 'error') && (
          <DialogFooter>
            <Button onClick={onClose} variant={txState.status === 'error' ? 'outline' : 'default'}>
              {txState.status === 'error' ? 'Try Again' : 'Done'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Transfer row ─────────────────────────────────────────────────────────────

function TransferRow({
  transfer,
  isMyPayment,
  onPay,
  disabled,
}: {
  transfer: SettlementTransfer
  isMyPayment: boolean
  onPay: () => void
  disabled: boolean
}) {
  return (
    <div className={`flex items-center gap-3 py-3.5 ${isMyPayment ? 'bg-amber-50 -mx-4 px-4 rounded-xl' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">{transfer.fromName}</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-800">{transfer.toName}</span>
          {isMyPayment && (
            <Badge variant="warning" className="text-[10px]">You pay</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-xs text-slate-400 font-mono">{shortenAddress(transfer.from, 4, 4)}</p>
          <span className="text-slate-300">→</span>
          <p className="text-xs text-slate-400 font-mono">{shortenAddress(transfer.to, 4, 4)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-mono text-base font-bold text-slate-800 tabular-nums">
          {formatCents(transfer.amount)}
        </span>
        {isMyPayment && (
          <Button size="sm" onClick={onPay} disabled={disabled} className="gap-1">
            Pay
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Manual send-money card ───────────────────────────────────────────────────

function SendMoneyCard({
  members,
  publicKey,
  busy,
  onSend,
}: {
  members: Member[]
  publicKey: string | null
  busy: boolean
  onSend: (to: string, amount: number, memo?: string) => Promise<void> | void
}) {
  const [selectedMember, setSelectedMember] = useState<string>('')
  const [customAddr, setCustomAddr] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recipients = members.filter(m => m.active)
  const target = customAddr.trim() || selectedMember

  async function handleSend() {
    setError(null)
    if (!target) { setError('Pick a recipient or enter an address.'); return }
    if (target === publicKey) { setError('Sender and recipient cannot be the same account.'); return }
    const amount = toCents(parseFloat(amountStr) || 0)
    if (amount <= 0) { setError('Enter an amount greater than zero.'); return }
    try {
      await onSend(target, amount, memo.trim() || undefined)
      setSelectedMember(''); setCustomAddr(''); setAmountStr(''); setMemo('')
    } catch {
      // Error surfaced via toast/progress modal
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-500" />
            Send money
          </CardTitle>
          <Badge variant="secondary">Manual transfer</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div>
          <p className="text-sm text-slate-500 mb-2">
            Move money from your wallet to any Stellar account. You approve this in Freighter.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Input label="Amount (USD)" prefix="$" placeholder="0.00" value={amountStr} inputMode="decimal" onChange={e => setAmountStr(e.target.value)} />
          </div>
          <div>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger aria-label="Recipient">
                <SelectValue placeholder="Recipient (household member)" />
              </SelectTrigger>
              <SelectContent>
                {recipients.map(m => (
                  <SelectItem key={m.address} value={m.address}>
                    {m.displayName} · {shortenAddress(m.address, 3, 3)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Input label="Or enter any Stellar address" placeholder="GABCD…" value={customAddr}
          onChange={e => setCustomAddr(e.target.value)}
          hint={selectedMember ? 'Leave blank to use the selected member above.' : undefined}
        />

        <Input label="Memo (optional)" placeholder="e.g. August rent share" value={memo} maxLength={28}
          onChange={e => setMemo(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full" onClick={handleSend} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? 'Sending…' : 'Send money'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SettlementPage() {
  const { household, balances, transfers, settlements } = useAppStore()
  const { publicKey } = useWalletStore()
  const { settleTransfer, sendTransfer, txState, resetTx } = useSettlement()

  const [activeTransfer, setActiveTransfer] = useState<SettlementTransfer | null>(null)
  const [txModalOpen, setTxModalOpen] = useState(false)

  if (!household) {
    return (
      <div className="py-8 animate-fade-in">
        <EmptyState icon={ArrowLeftRight} title="No household" description="Create a household to see settlements." />
      </div>
    )
  }

  const period   = currentPeriodLabel()
  const isSettled = allSettled(balances)
  const myBalance = balances.find(b => b.member === publicKey)
  const iAmPaying = transfers.some(t => t.from === publicKey)

  async function handlePay(transfer: SettlementTransfer) {
    setActiveTransfer(transfer)
    resetTx()
    setTxModalOpen(true)
    try {
      await settleTransfer(transfer)
    } catch {
      // error shown in modal
    }
  }

  function handleModalClose() {
    setTxModalOpen(false)
    resetTx()
    setActiveTransfer(null)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-slate-800">Settlements</h1>
        <p className="text-sm text-slate-500 mt-0.5">{period} · {household.name}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className={myBalance && myBalance.netBalance < 0 ? 'border-red-100 bg-red-50' : 'border-slate-100'}>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">You owe</p>
            <p className={`text-xl font-extrabold tabular-nums ${myBalance && myBalance.netBalance < 0 ? 'text-red-600' : 'text-slate-400'}`}>
              {myBalance && myBalance.netBalance < 0 ? formatCents(Math.abs(myBalance.netBalance)) : '$0.00'}
            </p>
          </CardContent>
        </Card>
        <Card className={myBalance && myBalance.netBalance > 0 ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100'}>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">You receive</p>
            <p className={`text-xl font-extrabold tabular-nums ${myBalance && myBalance.netBalance > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
              {myBalance && myBalance.netBalance > 0 ? formatCents(myBalance.netBalance) : '$0.00'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Settled! */}
      {isSettled && (
        <Card className="border-emerald-100 bg-emerald-50">
          <CardContent className="p-5 text-center">
            <p className="text-2xl mb-2">🎉</p>
            <p className="font-semibold text-emerald-700">Everything is settled!</p>
            <p className="text-sm text-emerald-600 mt-1">All balances are zero.</p>
          </CardContent>
        </Card>
      )}

      {/* Transfer plan */}
      {transfers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Settlement plan</CardTitle>
              <Badge variant="secondary">{transfers.length} transfer{transfers.length !== 1 ? 's' : ''}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-slate-50">
              {transfers.map((t, _i) => (
                <TransferRow
                  key={`${t.from}-${t.to}-${_i}`}
                  transfer={t}
                  isMyPayment={t.from === publicKey}
                  onPay={() => handlePay(t)}
                  disabled={txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error'}
                />
              ))}
            </div>

            {iAmPaying && !isSettled && (
              <>
                <Separator className="my-4" />
                <Button
                  className="w-full"
                  onClick={() => {
                    const myFirst = transfers.find(t => t.from === publicKey)
                    if (myFirst) handlePay(myFirst)
                  }}
                  disabled={txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error'}
                >
                  Settle with Stellar
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual transfer */}
      <SendMoneyCard
        members={household.members}
        publicKey={publicKey}
        busy={txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error'}
        onSend={async (to, amount, memo) => {
          setActiveTransfer({ from: publicKey ?? '', fromName: 'You', to, toName: '', amount })
          resetTx()
          setTxModalOpen(true)
          await sendTransfer({ to, amount, memo })
        }}
      />

      {/* All member balances */}
      <Card>
        <CardHeader>
          <CardTitle>All balances</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {balances.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">Add bills to see balances.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {balances.map(b => (
                <div key={b.member} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold select-none">
                    {b.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{b.displayName}</p>
                    <p className="text-xs text-slate-400 font-mono">{shortenAddress(b.member)}</p>
                  </div>
                  <span className={`font-mono text-sm font-bold tabular-nums ${
                    b.netBalance > 0 ? 'text-emerald-600' : b.netBalance < 0 ? 'text-red-600' : 'text-slate-400'
                  }`}>
                    {b.netBalance > 0 ? '+' : ''}{formatCents(b.netBalance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed settlements history */}
      {settlements.filter(s => s.status === 'completed').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completed payments</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {settlements.filter(s => s.status === 'completed').map(s => {
              const payerName = household.members.find(m => m.address === s.payer)?.displayName ?? shortenAddress(s.payer)
              const recvName  = household.members.find(m => m.address === s.receiver)?.displayName ?? shortenAddress(s.receiver)
              return (
                <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status="completed" />
                    <span className="text-slate-600">{payerName} → {recvName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-700 tabular-nums">{formatCents(s.amount)}</span>
                    {s.transactionHash && (
                      <a
                        href={getExplorerTxUrl(s.transactionHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View transaction"
                        className="text-indigo-400 hover:text-indigo-600"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* TX Modal */}
      <TxProgressModal
        open={txModalOpen}
        txState={txState}
        transfer={activeTransfer}
        onClose={handleModalClose}
      />
    </div>
  )
}
