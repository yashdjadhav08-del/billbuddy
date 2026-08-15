import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, AlertTriangle, CheckCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { useSettlement } from '@/hooks/useSettlement'
import { formatCents } from '@/lib/money'
import { currentPeriodLabel } from '@/lib/utils'
import { allSettled, totalOwed } from '@/lib/balance'

export function MonthlyClosePage() {
  const navigate = useNavigate()
  const { household, bills, balances, settlements } = useAppStore()
  const { publicKey } = useWalletStore()
  const { closePeriod } = useSettlement()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  if (!household) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-500 mb-4">Create a household first.</p>
        <Button onClick={() => navigate('/household')}>Go to Household</Button>
      </div>
    )
  }

  const period        = currentPeriodLabel()
  const isOwner       = household.owner === publicKey
  const isAlreadyClosed = household.periodClosed
  const settled       = allSettled(balances)
  const outstanding   = totalOwed(balances)

  const activeBills   = bills.filter(b => b.status === 'active')
  const totalBills    = activeBills.reduce((s, b) => s + b.totalAmount, 0)
  const completedSettlements = settlements.filter(s => s.status === 'completed')
  const totalSettled  = completedSettlements.reduce((s, x) => s + x.amount, 0)
  const settledPct    = totalBills > 0 ? Math.min(100, Math.round((totalSettled / totalBills) * 100)) : 100
  const activeMembers = household.members.filter(m => m.active)

  async function handleClose() {
    setConfirmOpen(false)
    setClosing(true)
    try {
      await closePeriod(period)
    } catch {
      // errors shown by hook
    } finally {
      setClosing(false)
    }
  }

  // ─── Already closed ───────────────────────────────────────────────────────

  if (isAlreadyClosed) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-slate-800">Monthly Close</h1>
          <p className="text-sm text-slate-500 mt-0.5">{household.periodLabel || period}</p>
        </div>

        <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <div>
              <h2 className="text-xl font-bold text-emerald-700">
                {household.periodLabel || period} is settled!
              </h2>
              <p className="text-sm text-emerald-600 mt-1">
                All household bills have been paid.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2">
              {[
                { label: 'Bills', value: activeBills.length.toString() },
                { label: 'Members', value: activeMembers.length.toString() },
                { label: 'Outstanding', value: '$0' },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl font-extrabold text-emerald-700">{stat.value}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => navigate('/dashboard')}
            >
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Active close page ────────────────────────────────────────────────────

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-slate-800">Monthly Close</h1>
        <p className="text-sm text-slate-500 mt-0.5">{period}</p>
      </div>

      {/* Period summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-indigo-500" />
            {period} Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="space-y-3">
            {[
              { label: 'Total bills',       value: formatCents(totalBills),   sub: `${activeBills.length} bills` },
              { label: 'Total settled',     value: formatCents(totalSettled), sub: `${completedSettlements.length} payments` },
              { label: 'Outstanding',       value: formatCents(outstanding),  sub: outstanding > 0 ? 'Needs settlement' : 'All clear', highlight: outstanding > 0 },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">{row.label}</p>
                  <p className="text-xs text-slate-400">{row.sub}</p>
                </div>
                <span className={`font-mono text-base font-bold tabular-nums ${row.highlight ? 'text-red-600' : 'text-slate-800'}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Settlement progress</span>
              <span>{settledPct}%</span>
            </div>
            <Progress value={settledPct} />
          </div>
        </CardContent>
      </Card>

      {/* Member balances */}
      <Card>
        <CardHeader>
          <CardTitle>Member balances</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y divide-slate-50">
            {balances.map(b => (
              <div key={b.member} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold select-none">
                  {b.displayName.slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 text-sm font-medium text-slate-700">{b.displayName}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-sm font-bold tabular-nums ${
                    b.netBalance > 0 ? 'text-emerald-600'
                    : b.netBalance < 0 ? 'text-red-600'
                    : 'text-slate-400'
                  }`}>
                    {b.netBalance > 0 ? '+' : ''}{formatCents(b.netBalance)}
                  </span>
                  {b.netBalance === 0
                    ? <CheckCircle className="h-4 w-4 text-emerald-500" aria-label="Settled" />
                    : <AlertTriangle className="h-4 w-4 text-amber-400" aria-label="Outstanding" />
                  }
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Not ready warning */}
      {!settled && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700">Outstanding balances remain</p>
            <p className="text-sm text-amber-600 mt-0.5">
              All members must be at zero before closing the period.{' '}
              <button
                className="underline font-medium"
                onClick={() => navigate('/settlements')}
              >
                Settle now →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Close button */}
      {isOwner && (
        <Button
          className="w-full"
          size="lg"
          disabled={!settled || closing}
          loading={closing}
          onClick={() => setConfirmOpen(true)}
        >
          <Lock className="h-4 w-4" />
          Close {period}
        </Button>
      )}

      {!isOwner && settled && (
        <p className="text-sm text-center text-slate-400">
          Only the household owner can close the period.
        </p>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close {period}?</DialogTitle>
            <DialogDescription>
              This will lock the period. All balances are zero and this action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">All {activeMembers.length} members are settled</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="success" onClick={handleClose} loading={closing}>
              Confirm Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
