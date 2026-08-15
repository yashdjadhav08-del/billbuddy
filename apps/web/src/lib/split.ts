/**
 * Bill split helpers and validators.
 * All amounts in integer minor units (cents).
 */

import type { MemberShare, SplitType } from '@/types'
import { equalSplit, percentageSplit, validateSplitSum } from './money'

export interface SplitValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate that member shares are internally consistent for a given split type.
 */
export function validateShares(
  shares: MemberShare[],
  totalAmount: number,
  splitType: SplitType,
): SplitValidationResult {
  if (shares.length === 0) {
    return { valid: false, error: 'At least one member must share this bill.' }
  }

  if (totalAmount <= 0) {
    return { valid: false, error: 'Amount must be greater than zero.' }
  }

  for (const s of shares) {
    if (s.amount < 0) {
      return { valid: false, error: 'Share amounts cannot be negative.' }
    }
  }

  const sum = shares.reduce((acc, s) => acc + s.amount, 0)

  if (splitType === 'percentage') {
    // For percentage splits the caller passes resolved cent amounts
    if (!validateSplitSum(shares.map(s => s.amount), totalAmount)) {
      return {
        valid: false,
        error: `Shares total ${sum} cents but bill is ${totalAmount} cents. Check percentages.`,
      }
    }
  } else {
    if (!validateSplitSum(shares.map(s => s.amount), totalAmount)) {
      return {
        valid: false,
        error: `Shares sum to ${sum} cents but bill total is ${totalAmount} cents.`,
      }
    }
  }

  return { valid: true }
}

/**
 * Build equal shares for a list of member addresses.
 */
export function buildEqualShares(memberAddresses: string[], totalAmount: number): MemberShare[] {
  const amounts = equalSplit(totalAmount, memberAddresses.length)
  return memberAddresses.map((addr, i) => ({ member: addr, amount: amounts[i] }))
}

/**
 * Build shares from percentage values (integers 0–100, must sum to 100).
 */
export function buildPercentageShares(
  memberAddresses: string[],
  percentages: number[],
  totalAmount: number,
): MemberShare[] {
  const amounts = percentageSplit(totalAmount, percentages)
  return memberAddresses.map((addr, i) => ({ member: addr, amount: amounts[i] }))
}

/** Category display metadata */
export const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  rent: { label: 'Rent', emoji: '🏠' },
  electricity: { label: 'Electricity', emoji: '⚡' },
  water: { label: 'Water', emoji: '💧' },
  internet: { label: 'Internet', emoji: '📡' },
  groceries: { label: 'Groceries', emoji: '🛒' },
  streaming: { label: 'Streaming', emoji: '📺' },
  maintenance: { label: 'Maintenance', emoji: '🔧' },
  custom: { label: 'Custom', emoji: '📝' },
}
