import { cn } from '@/lib/utils'
import type { SettlementStatus } from '@/types'

const statusConfig: Record<SettlementStatus, { color: string; label: string }> = {
  pending:    { color: 'bg-amber-400',  label: 'Pending' },
  signing:    { color: 'bg-blue-400',   label: 'Signing' },
  submitted:  { color: 'bg-indigo-400', label: 'Submitted' },
  confirming: { color: 'bg-violet-400', label: 'Confirming' },
  completed:  { color: 'bg-emerald-500', label: 'Completed' },
  failed:     { color: 'bg-red-500',    label: 'Failed' },
}

interface StatusDotProps {
  status: SettlementStatus
  showLabel?: boolean
  className?: string
}

export function StatusDot({ status, showLabel = false, className }: StatusDotProps) {
  const { color, label } = statusConfig[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full flex-shrink-0',
          color,
          status === 'confirming' && 'animate-pulse',
        )}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="text-xs text-slate-500">{label}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}
