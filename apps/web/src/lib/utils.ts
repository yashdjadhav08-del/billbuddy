import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a Unix timestamp (seconds) to "August 2026" style */
export function formatPeriod(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Format a Unix timestamp to "Aug 12, 2026" */
export function formatDate(timestamp: number): string {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Current time period label, e.g. "August 2026" */
export function currentPeriodLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Greeting based on hour of day */
export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Truncate long strings with ellipsis */
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str
}

/** Sleep for n milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
