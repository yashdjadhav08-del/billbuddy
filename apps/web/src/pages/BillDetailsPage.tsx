import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { useBill } from '@/hooks/useBill'
import { formatCents } from '@/lib/money'
import { CATEGORY_META } from '@/lib/split'
import { formatDate } from '@/lib/utils'

export function BillDetailsPage() {
  const { billId } = useParams<{ billId: string }>()
  const navigate   = useNavigate()
  const { bills, household, settlements, isLoading } = useAppStore()
  const { publicKey } = useWalletStore()
  const { payBill } = useBill()
  const [paying, setPaying] = useState(false)

  const bill = bills.find(b => b.id === Number(billId))

  if (!bill) {
    return (
      <div className="py-8 text-center">
        <p className="text-slate-500 text-sm mb-4">Bill not found.</p>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </div>
    )
  }

  const meta = CATEGORY_META[bill.category]
  const totalContributed = bill.contributions.reduce((s, c) => s + c.amount, 0)
  const myShare = bill.shares.find(s => s.member === publicKey)
  const myContrib = bill.contributions.find(c => c.member === publicKey)
  const myNet = (myContrib?.amount ?? 0) - (myShare?.amount ?? 0)

  // Find relevant completed settlements for this bill's members
  const relevantSettlements = settlements.filter(
    s => s.status === 'completed' && (s.payer === publicKey || s.receiver === publicKey),
  )

  function getMemberName(address: string) {
    return household?.members.find(m => m.address === address)?.displayName ?? shorten(address)
  }

  function shorten(address: string): string {
    if (address.length <= 12) return address
    return `${address.slice(0, 4)}…${address.slice(-4)}`
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Button size="icon-sm" variant="ghost" onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">{meta?.emoji ?? '📝'}</span>
            <h1 className="text-xl font-bold text-slate-800 truncate">{bill.title}</h1>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary">{meta?.label ?? bill.category}</Badge>
            <Badge variant={bill.status === 'settled' ? 'success' : 'warning'}>
              {bill.status === 'settled' ? 'Settled' : 'Active'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Amount card */}
      <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
        <CardContent className="p-5">
          <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide">Total</p>
          <p className="text-4xl font-extrabold text-slate-800 tabular-nums mt-1">
            {formatCents(bill.totalAmount)}
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Created by {shorten(bill.creator)}
          </p>
          {bill.dueDate > 0 && (
            <p className="text-sm text-slate-400 mt-0.5">Due {formatDate(bill.dueDate)}</p>
          )}
        </CardContent>
      </Card>

      {/* My position */}
      {publicKey && myShare && (
        <Card className={myNet < 0 ? 'border-red-100 bg-red-50' : myNet > 0 ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100'}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Your position</p>
            <p className={`text-xl font-bold tabular-nums ${myNet < 0 ? 'text-red-600' : myNet > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
              {myNet < 0
                ? `You owe ${formatCents(Math.abs(myNet))}`
                : myNet > 0
                ? `You are owed ${formatCents(myNet)}`
                : 'You\'re square on this bill'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Your share: {formatCents(myShare.amount)} · You paid: {formatCents(myContrib?.amount ?? 0)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Split breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Split between {bill.shares.length} members
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y divide-slate-50">
            {bill.shares.map(share => {
              const contrib = bill.contributions.find(c => c.member === share.member)
              const net = (contrib?.amount ?? 0) - share.amount
              const isPayer = contrib && contrib.amount > 0
              return (
                <div key={share.member} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold select-none">
                    {getMemberName(share.member).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{getMemberName(share.member)}</p>
                    <p className="text-xs text-slate-400">
                      {isPayer ? `Paid ${formatCents(contrib!.amount)}` : 'Did not pay'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-slate-700 tabular-nums">
                      {formatCents(share.amount)}
                    </p>
                    <Badge
                      variant={net >= 0 ? 'success' : 'warning'}
                      className="text-[10px] mt-0.5"
                    >
                      {net >= 0 ? '✓' : `Owes ${formatCents(Math.abs(net))}`}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>

          <Separator className="my-3" />
          <div className="flex justify-between px-1 text-sm">
            <span className="text-slate-500">Contributed</span>
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {formatCents(totalContributed)} / {formatCents(bill.totalAmount)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Relevant settlements */}
      {relevantSettlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Settlements
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {relevantSettlements.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-600">
                  {getMemberName(s.payer)} → {getMemberName(s.receiver)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold tabular-nums">{formatCents(s.amount)}</span>
                  {s.transactionHash && (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${s.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-500 hover:text-indigo-700"
                      aria-label="View on explorer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      {myShare && myNet < 0 && bill.status !== 'settled' && (
        <Button
          className="w-full"
          size="lg"
          loading={paying || isLoading}
          disabled={paying}
          onClick={() => {
            if (paying) return
            setPaying(true)
            payBill(bill.id)
              .catch(() => {})
              .finally(() => setPaying(false))
          }}
        >
          Pay {formatCents(Math.abs(myNet))} with Stellar →
        </Button>
      )}
      {household && !myShare && myNet < 0 && (
        <Button
          className="w-full"
          size="lg"
          variant="outline"
          onClick={() => navigate('/settlements')}
        >
          Pay with Stellar →
        </Button>
      )}
    </div>
  )
}
