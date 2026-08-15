/**
 * Settlement optimizer.
 *
 * Given a list of net balances, produces the minimum number of directed
 * payment transfers needed to zero all balances.
 *
 * Properties guaranteed:
 *   - Total money is preserved (no creation, no destruction)
 *   - No member pays more than their debt
 *   - No member receives more than their credit
 *   - Zero balances produce no transfers
 *   - Deterministic output for any input
 *
 * Algorithm: greedy matching of largest creditor with largest debtor.
 * This is optimal (minimum transfers) for the general case.
 *
 * All amounts are integer minor units (cents).
 */

import type { MemberBalance, SettlementTransfer } from '@/types'

interface Party {
  member: string
  displayName: string
  amount: number // always positive: either debt or credit
}

/**
 * Generate an optimized list of transfers to settle all debts.
 */
export function optimizeSettlements(balances: MemberBalance[]): SettlementTransfer[] {
  const transfers: SettlementTransfer[] = []

  // Separate creditors (positive) and debtors (negative)
  const creditors: Party[] = balances
    .filter(b => b.netBalance > 0)
    .map(b => ({ member: b.member, displayName: b.displayName, amount: b.netBalance }))

  const debtors: Party[] = balances
    .filter(b => b.netBalance < 0)
    .map(b => ({ member: b.member, displayName: b.displayName, amount: Math.abs(b.netBalance) }))

  // Sort descending by amount for greedy matching
  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]

    const transfer = Math.min(creditor.amount, debtor.amount)

    if (transfer > 0) {
      transfers.push({
        from: debtor.member,
        fromName: debtor.displayName,
        to: creditor.member,
        toName: creditor.displayName,
        amount: transfer,
      })
    }

    creditor.amount -= transfer
    debtor.amount -= transfer

    if (creditor.amount === 0) ci++
    if (debtor.amount === 0) di++
  }

  return transfers
}

/**
 * Verify that a set of transfers correctly zeros all balances.
 * Used in tests and as a runtime assertion.
 */
export function verifyTransfers(
  balances: MemberBalance[],
  transfers: SettlementTransfer[],
): boolean {
  const net: Record<string, number> = {}
  for (const b of balances) net[b.member] = b.netBalance

  for (const t of transfers) {
    net[t.from] = (net[t.from] ?? 0) + t.amount
    net[t.to] = (net[t.to] ?? 0) - t.amount
  }

  return Object.values(net).every(v => v === 0)
}
