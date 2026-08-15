import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity as ActivityIcon } from 'lucide-react'
import { useActivityStore } from '@/stores/activityStore'
import { useAppStore } from '@/stores/appStore'
import { config } from '@/config/env'
import { formatCents } from '@/lib/money'
import type { ActivityItem } from '@/types'

const TYPE_META: Record<ActivityItem['type'], { emoji: string; tone: string }> = {
  household_created:     { emoji: '🏠', tone: 'bg-indigo-50' },
  member_added:          { emoji: '👋', tone: 'bg-emerald-50' },
  member_removed:        { emoji: '🚪', tone: 'bg-red-50' },
  bill_created:          { emoji: '🧾', tone: 'bg-blue-50' },
  bill_updated:          { emoji: '✏️', tone: 'bg-amber-50' },
  bill_paid:             { emoji: '✅', tone: 'bg-emerald-50' },
  settlement_created:    { emoji: '💸', tone: 'bg-amber-50' },
  settlement_completed:  { emoji: '✅', tone: 'bg-emerald-50' },
  settlement_failed:     { emoji: '❌', tone: 'bg-red-50' },
  period_closed:         { emoji: '🎉', tone: 'bg-emerald-50' },
}

function timeAgo(at: number): string {
  const diff = Date.now() - at
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function ActivityFeed() {
  const items = useActivityStore(s => s.items)
  const { bills, settlements } = useAppStore()

  // In mock mode (dev only) derive a lightweight feed from local state so the
  // UI is not empty. In real mode the feed comes from on-chain contract events.
  const displayItems: ActivityItem[] = useMemo(() => {
    if (items.length > 0 || !config.flags.mockMode) return items

    const mock: ActivityItem[] = []
    for (const b of bills) {
      mock.push({
        id: `bill-${b.id}`,
        type: 'bill_created',
        ledger: b.id,
        at: b.createdAt * 1000,
        householdId: b.householdId,
        description: `Bill "${b.title}" was added · ${formatCents(b.totalAmount)}`,
      })
    }
    for (const s of settlements) {
      if (s.status !== 'completed') continue
      mock.push({
        id: `settle-${s.id}`,
        type: 'settlement_completed',
        ledger: s.id,
        at: s.createdAt * 1000,
        householdId: s.householdId,
        description: `Payment of ${formatCents(s.amount)} completed · transaction confirmed`,
      })
    }
    return mock.sort((a, b) => b.ledger - a.ledger).slice(0, 10)
  }, [items, bills, settlements])

  if (displayItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <ActivityIcon className="h-4 w-4" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-slate-400 py-2">
            No activity yet. Create a bill or make a payment to see updates here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <ActivityIcon className="h-4 w-4" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-slate-50">
          {displayItems.slice(0, 12).map(item => {
            const meta = TYPE_META[item.type]
            return (
              <div key={item.id} className="flex items-center gap-3 py-2.5">
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm ${meta.tone}`}>
                  {meta.emoji}
                </span>
                <p className="flex-1 text-sm text-slate-700 leading-snug">{item.description}</p>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{timeAgo(item.at)}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}