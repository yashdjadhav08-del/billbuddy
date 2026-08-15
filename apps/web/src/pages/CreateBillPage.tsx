import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { useBill } from '@/hooks/useBill'
import { toCents, formatCents, centsToString } from '@/lib/money'
import { buildEqualShares, buildPercentageShares, validateShares } from '@/lib/split'
import type { BillCategory, MemberContribution, MemberShare, SplitType } from '@/types'

const CATEGORIES: { value: BillCategory; label: string; emoji: string }[] = [
  { value: 'rent',        label: 'Rent',        emoji: '🏠' },
  { value: 'electricity', label: 'Electricity', emoji: '⚡' },
  { value: 'water',       label: 'Water',       emoji: '💧' },
  { value: 'internet',    label: 'Internet',    emoji: '📡' },
  { value: 'groceries',   label: 'Groceries',   emoji: '🛒' },
  { value: 'streaming',   label: 'Streaming',   emoji: '📺' },
  { value: 'maintenance', label: 'Maintenance', emoji: '🔧' },
  { value: 'custom',      label: 'Custom',      emoji: '📝' },
]

interface MemberRow {
  address: string
  displayName: string
  shareValue: string    // displayed input value (amount or percentage)
  contribution: string  // how much this member actually paid
}

export function CreateBillPage() {
  const navigate = useNavigate()
  const { household, isLoading } = useAppStore()
  const { publicKey } = useWalletStore()
  const { createBill } = useBill()

  const [title, setTitle]         = useState('')
  const [category, setCategory]   = useState<BillCategory>('custom')
  const [amountStr, setAmountStr] = useState('')
  const [dueDate, setDueDate]     = useState('')
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors]       = useState<Record<string, string>>({})

  const activeMembers = useMemo(
    () => household?.members.filter(m => m.active) ?? [],
    [household],
  )

  const [memberRows, setMemberRows] = useState<MemberRow[]>([])

  // Re-initialize rows whenever members or split type changes
  useEffect(() => {
    const totalCents = toCents(parseFloat(amountStr) || 0)
    const n = activeMembers.length
    if (n === 0) { setMemberRows([]); return }

    setMemberRows(activeMembers.map((m, i) => {
      const defaultShare =
        splitType === 'equal'        ? (totalCents > 0 ? centsToString(Math.floor(totalCents / n) + (i < totalCents % n ? 1 : 0)) : '0')
        : splitType === 'percentage' ? String(Math.floor(100 / n) + (i < 100 % n ? 1 : 0))
        : '0'
      const isPayer = m.address === publicKey
      return {
        address: m.address,
        displayName: m.displayName,
        shareValue: defaultShare,
        contribution: isPayer && totalCents > 0 ? centsToString(totalCents) : '0',
      }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembers.length, splitType])

  // Recompute equal shares when amount changes
  useEffect(() => {
    if (splitType !== 'equal') return
    const totalCents = toCents(parseFloat(amountStr) || 0)
    setMemberRows(prev => {
      const n = prev.length
      if (n === 0) return prev
      return prev.map((r, i) => ({
        ...r,
        shareValue: centsToString(Math.floor(totalCents / n) + (i < totalCents % n ? 1 : 0)),
      }))
    })
  }, [amountStr, splitType])

  function updateRow(index: number, field: 'shareValue' | 'contribution', value: string) {
    setMemberRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  // Live split preview
  const splitPreview = useMemo(() => {
    const totalCents = toCents(parseFloat(amountStr) || 0)
    if (totalCents <= 0 || memberRows.length === 0) return null

    let shares: MemberShare[]
    if (splitType === 'equal') {
      shares = buildEqualShares(memberRows.map(r => r.address), totalCents)
    } else if (splitType === 'percentage') {
      const percentages = memberRows.map(r => parseInt(r.shareValue) || 0)
      const pctSum = percentages.reduce((a, b) => a + b, 0)
      if (pctSum !== 100) return { shares: [], valid: false, error: `Percentages sum to ${pctSum}%, must equal 100%` }
      shares = buildPercentageShares(memberRows.map(r => r.address), percentages, totalCents)
    } else {
      shares = memberRows.map(r => ({
        member: r.address,
        amount: toCents(parseFloat(r.shareValue) || 0),
      }))
    }

    const validation = validateShares(shares, totalCents, splitType)
    return { shares, ...validation }
  }, [amountStr, splitType, memberRows])

  function validate() {
    const e: Record<string, string> = {}
    if (!title.trim())   e.title    = 'Bill name is required'
    const amt = parseFloat(amountStr)
    if (!amountStr || isNaN(amt) || amt <= 0) e.amount = 'Enter a valid amount greater than zero'
    if (!splitPreview?.valid) e.split = splitPreview?.error ?? 'Invalid split'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !splitPreview?.valid) return
    if (!household) return

    const totalCents = toCents(parseFloat(amountStr))
    const contributions: MemberContribution[] = memberRows.map(r => ({
      member: r.address,
      amount: toCents(parseFloat(r.contribution) || 0),
    }))

    // Validate contributions don't exceed total
    const contribSum = contributions.reduce((s, c) => s + c.amount, 0)
    if (contribSum > totalCents) {
      setErrors(prev => ({ ...prev, contributions: 'Contributions exceed the bill total' }))
      return
    }

    const dueDateTs = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : 0

    setSubmitting(true)
    try {
      await createBill({
        title: title.trim(),
        category,
        totalAmount: totalCents,
        dueDate: dueDateTs,
        splitType,
        shares: splitPreview.shares!,
        contributions,
      })
      navigate('/dashboard')
    } catch {
      // handled by hook
    } finally {
      setSubmitting(false)
    }
  }

  if (!household) {
    return (
      <div className="py-8 text-center text-slate-500 text-sm">
        Create a household first.
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Button size="icon-sm" variant="ghost" onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Add Bill</h1>
          <p className="text-xs text-slate-400">{household.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Basic info */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <Input
              label="Bill name"
              placeholder="e.g. August Rent"
              value={title}
              onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: '' })) }}
              error={errors.title}
              autoFocus
              maxLength={64}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Category</label>
              <Select value={category} onValueChange={v => setCategory(v as BillCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              label="Amount"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              prefix="$"
              min="0.01"
              step="0.01"
              value={amountStr}
              onChange={e => { setAmountStr(e.target.value); setErrors(p => ({ ...p, amount: '' })) }}
              error={errors.amount}
            />

            <Input
              label="Due date (optional)"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Split method */}
        <Card>
          <CardHeader>
            <CardTitle>Split method</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(['equal', 'custom_amount', 'percentage'] as SplitType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSplitType(type)}
                  className={`rounded-xl border p-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                    ${splitType === type
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  aria-pressed={splitType === type}
                >
                  {type === 'equal' ? '= Equal' : type === 'custom_amount' ? '$ Custom' : '% Percent'}
                </button>
              ))}
            </div>

            {/* Member rows */}
            <div className="space-y-2">
              {memberRows.map((row, i) => (
                <div key={row.address} className="flex items-center gap-2">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold select-none">
                    {row.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm text-slate-700 truncate">{row.displayName}</span>
                  <div className="w-24">
                    {splitType === 'equal' ? (
                      <div className="h-9 rounded-lg bg-slate-50 border border-slate-200 px-3 flex items-center justify-end">
                        <span className="text-sm font-mono text-slate-600">
                          {splitPreview?.shares?.[i] ? formatCents(splitPreview.shares[i].amount) : '—'}
                        </span>
                      </div>
                    ) : (
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={splitType === 'percentage' ? '1' : '0.01'}
                        value={row.shareValue}
                        onChange={e => updateRow(i, 'shareValue', e.target.value)}
                        prefix={splitType === 'percentage' ? '%' : '$'}
                        className="h-9 text-right pr-3"
                        aria-label={`Share for ${row.displayName}`}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Split validation */}
            {splitPreview && toCents(parseFloat(amountStr) || 0) > 0 && (
              <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm
                ${splitPreview.valid
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'}`}
              >
                {splitPreview.valid
                  ? <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                }
                <span>{splitPreview.valid ? 'Split is valid ✓' : splitPreview.error}</span>
              </div>
            )}
            {errors.split && (
              <p role="alert" className="text-xs text-red-600">{errors.split}</p>
            )}
          </CardContent>
        </Card>

        {/* Who paid? */}
        <Card>
          <CardHeader>
            <CardTitle>Who paid?</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <p className="text-xs text-slate-400 mb-3">Enter how much each member actually paid toward this bill.</p>
            {memberRows.map((row, i) => (
              <div key={row.address} className="flex items-center gap-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold select-none">
                  {row.displayName.slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 text-sm text-slate-700 truncate">{row.displayName}</span>
                <div className="w-24">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={row.contribution}
                    onChange={e => updateRow(i, 'contribution', e.target.value)}
                    prefix="$"
                    className="h-9 text-right pr-3"
                    aria-label={`Contribution for ${row.displayName}`}
                  />
                </div>
              </div>
            ))}
            {errors.contributions && (
              <p role="alert" className="text-xs text-red-600">{errors.contributions}</p>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          type="submit"
          loading={submitting || isLoading}
          disabled={!splitPreview?.valid}
          className="w-full"
          size="lg"
        >
          Add Bill
        </Button>
      </form>
    </div>
  )
}
