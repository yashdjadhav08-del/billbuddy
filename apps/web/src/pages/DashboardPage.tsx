import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight, TrendingDown, TrendingUp, RefreshCw, MoreVertical, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { RowSkeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSync } from '@/hooks/useSync'
import { useBill } from '@/hooks/useBill'
import { ActivityFeed } from '@/components/activity/ActivityFeed'
import { formatCents, shortenAddress } from '@/lib/money'
import { CATEGORY_META } from '@/lib/split'
import { greeting, formatDate, currentPeriodLabel, cn } from '@/lib/utils'
import { Receipt } from 'lucide-react'
import type { Bill } from '@/types'

const LONG_PRESS_MS = 550

function useLongPress(onTrigger: () => void) {
  const [pressed, setPressed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = () => {
    setPressed(true)
    timerRef.current = setTimeout(() => {
      setPressed(false)
      onTrigger()
    }, LONG_PRESS_MS)
  }

  const cancel = () => {
    setPressed(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { pressed, bind: { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel } }
}

function BillRow({
  bill,
  walletAddress,
  paying,
  onPay,
  canDelete,
  onDelete,
}: {
  bill: Bill
  walletAddress: string | null
  paying: boolean
  onPay: () => void
  canDelete: boolean
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const meta = CATEGORY_META[bill.category]
  const myShare = bill.shares.find(s => s.member === walletAddress)
  const myContrib = bill.contributions.find(c => c.member === walletAddress)
  const myNet = (myContrib?.amount ?? 0) - (myShare?.amount ?? 0)
  const isPaid = myNet >= 0
  const owes = !!walletAddress && myShare !== undefined && myNet < 0
  const { pressed, bind } = useLongPress(() => setMenuOpen(true))

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <div
        className={cn(
          'flex w-full items-center gap-2 py-1.5 -mx-2 px-2 rounded-xl transition-colors select-none',
          pressed ? 'bg-indigo-50' : 'hover:bg-slate-50',
        )}
        style={{ touchAction: 'pan-y' }}
        {...bind}
      >
      <button
        onClick={() => navigate(`/bills/${bill.id}`)}
        className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
        aria-label={`${bill.title}, ${formatCents(bill.totalAmount)}`}
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl" aria-hidden="true">
          {meta?.emoji ?? '📝'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{bill.title}</p>
          <p className="text-xs text-slate-400">Due {formatDate(bill.dueDate)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="font-mono text-sm font-semibold text-slate-800 tabular-nums">
            {formatCents(bill.totalAmount)}
          </span>
          {walletAddress && myShare && (
            <Badge variant={isPaid ? 'success' : 'warning'} className="text-[10px] px-1.5 py-0">
              {isPaid ? '✓ Paid' : `Owes ${formatCents(Math.abs(myNet))}`}
            </Badge>
          )}
          {bill.status === 'settled' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Settled</Badge>
          )}
        </div>
      </button>
      {walletAddress && myShare !== undefined && bill.status === 'active' && (
        <Button
          size="sm"
          variant={owes ? 'default' : 'outline'}
          className="h-8 gap-1 flex-shrink-0"
          loading={paying}
          disabled={paying}
          onClick={owes ? onPay : () => navigate('/settlements')}
          aria-label={`${owes ? `Pay ${formatCents(Math.abs(myNet))} for ${bill.title}` : `Settle ${bill.title}`}`}
        >
          {owes ? `Pay ${formatCents(Math.abs(myNet))}` : 'Settle'}
        </Button>
      )}
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="More actions for bill"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuLabel>{bill.title}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate(`/bills/${bill.id}`)}>
          <Eye className="h-4 w-4 text-slate-400" />
          View details
        </DropdownMenuItem>
        {walletAddress && myShare !== undefined && bill.status === 'active' && (
          <DropdownMenuItem onSelect={owes ? onPay : () => navigate('/settlements')}>
            {owes ? `Pay ${formatCents(Math.abs(myNet))}` : 'Head to settlements'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {canDelete && bill.status !== 'settled' && (
          <>
            <DropdownMenuItem
              className="text-red-600 focus:bg-red-50 focus:text-red-700"
              onSelect={() => {
                if (window.confirm(`Delete "${bill.title}"? This removes it from shared state for everyone.`)) {
                  onDelete()
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-red-400" />
              Delete bill
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => navigate(`/bills/${bill.id}`)}>
          <span className="text-xs text-slate-400">Anyone can visit the bill page to pay their share.</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { household, bills, balances, isLoading } = useAppStore()
  const { publicKey } = useWalletStore()
  const { payBill, deleteBill } = useBill()
  const [payingId, setPayingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  useSync()

  const myBalance = balances.find(b => b.member === publicKey)
  const period = currentPeriodLabel()
  const activeBills = bills.filter(b => b.status === 'active')
  const hasBills = activeBills.length > 0

  async function handlePayBill(bill: Bill) {
    if (payingId) return
    setPayingId(bill.id)
    try {
      await payBill(bill.id)
    } catch {
      // errors surfaced via toast in the hook
    } finally {
      setPayingId(null)
    }
  }

  async function handleDeleteBill(bill: Bill) {
    if (deletingId) return
    setDeletingId(bill.id)
    try {
      await deleteBill(bill.id)
    } catch {
      // errors surfaced via toast in the hook
    } finally {
      setDeletingId(null)
    }
  }

  if (!household && !hasBills) {
    return (
      <div className="py-8 animate-fade-in">
        <EmptyState
          icon={Receipt}
          title="No household yet"
          description="Create or join a household to start tracking shared bills."
          action={{ label: 'Create Household', onClick: () => navigate('/household') }}
        />
      </div>
    )
  }

  const totalBills = activeBills.reduce((s, b) => s + b.totalAmount, 0)
  const hasHousehold = !!household
  const memberName = publicKey
    ? household?.members.find(m => m.address === publicKey)?.displayName ?? shortenAddress(publicKey)
    : 'there'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="pt-2">
        <p className="text-sm text-slate-400">{greeting()}, {memberName} 👋</p>
        <h1 className="text-2xl font-bold text-slate-800 mt-0.5">
          {household?.name ?? 'Your split bills'}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {household ? period : 'Bills you were added to are shown here automatically.'}
        </p>
      </div>

      {/* Balance card */}
      {hasHousehold && myBalance && (
        <Card className={`border-0 ${myBalance.netBalance < 0 ? 'bg-red-50' : myBalance.netBalance > 0 ? 'bg-emerald-50' : 'bg-slate-50'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {myBalance.netBalance < 0 ? 'You owe' : myBalance.netBalance > 0 ? 'You are owed' : 'You\'re all square'}
                </p>
                <p className={`text-3xl font-extrabold tabular-nums mt-1 ${
                  myBalance.netBalance < 0 ? 'text-red-600' : myBalance.netBalance > 0 ? 'text-emerald-600' : 'text-slate-600'
                }`}>
                  {formatCents(Math.abs(myBalance.netBalance))}
                </p>
              </div>
              {myBalance.netBalance < 0
                ? <TrendingDown className="h-8 w-8 text-red-300" aria-hidden="true" />
                : myBalance.netBalance > 0
                ? <TrendingUp className="h-8 w-8 text-emerald-300" aria-hidden="true" />
                : null}
            </div>
            {myBalance.netBalance < 0 && (
              <Button
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => navigate('/settlements')}
              >
                Pay now
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {myBalance.netBalance > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4 gap-1.5"
                onClick={() => navigate('/settlements')}
              >
                View settlements
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bills section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Bills</h2>
          <div className="flex gap-2">
            {isLoading && (
              <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" aria-label="Syncing…" />
            )}
            {hasHousehold && (
              <Button size="sm" variant="ghost" onClick={() => navigate('/bills/new')} className="h-8 gap-1">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            {isLoading && bills.length === 0 ? (
              <div className="space-y-1">
                {[1, 2, 3].map(i => <RowSkeleton key={i} />)}
              </div>
            ) : activeBills.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No bills yet"
                description={hasHousehold ? 'Add your first shared bill to get started.' : 'Nothing has been added to your wallet address yet.'}
                action={hasHousehold ? { label: '+ Add Bill', onClick: () => navigate('/bills/new') } : undefined}
                className="border-0 bg-transparent py-6"
              />
            ) : (
              <div className="divide-y divide-slate-50">
                {activeBills.map(bill => (
                  <BillRow
                    key={`${bill.householdId}:${bill.id}`}
                    bill={bill}
                    walletAddress={publicKey}
                    paying={payingId === bill.id}
                    onPay={() => void handlePayBill(bill)}
                    canDelete={
                      bill.creator === publicKey ||
                      (household?.owner === publicKey && bill.status !== 'settled')
                    }
                    onDelete={() => void handleDeleteBill(bill)}
                  />
                ))}
              </div>
            )}

            {activeBills.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="flex items-center justify-between px-2">
                  <span className="text-sm font-medium text-slate-500">Total</span>
                  <span className="font-mono text-base font-bold text-slate-800 tabular-nums">
                    {formatCents(totalBills)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity */}
      <ActivityFeed />

      {/* Quick actions */}
      {hasHousehold && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 text-xs font-medium"
            onClick={() => navigate('/settlements')}
          >
            <ArrowRight className="h-5 w-5 text-indigo-500" />
            Settlements
          </Button>
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 text-xs font-medium"
            onClick={() => navigate('/close')}
          >
            <span className="text-lg leading-none">🎉</span>
            Monthly Close
          </Button>
        </div>
      )}
    </div>
  )
}
