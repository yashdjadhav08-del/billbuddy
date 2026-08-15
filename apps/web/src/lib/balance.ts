/**
 * Balance calculation engine.
 * Pure functions with no side-effects — easy to unit test.
 *
 * All amounts are integer minor units (cents).
 */

import type { Bill, MemberBalance, Settlement } from '@/types'

/**
 * Calculate net balances for all members across a set of bills.
 *
 * net_balance = total_contributed − total_owed
 *   positive → member should receive money
 *   negative → member owes money
 *   zero     → settled
 *
 * Completed settlements are factored in automatically.
 */
export function calculateBalances(
  memberAddresses: string[],
  bills: Bill[],
  settlements: Settlement[],
  displayNames: Record<string, string>,
): MemberBalance[] {
  // Accumulate paid and owed for each member
  const paid: Record<string, number> = {}
  const owed: Record<string, number> = {}

  for (const addr of memberAddresses) {
    paid[addr] = 0
    owed[addr] = 0
  }

  // Process bills (skip settled — they were already counted when settled)
  for (const bill of bills) {
    if (bill.status === 'settled') continue

    for (const c of bill.contributions) {
      if (paid[c.member] !== undefined) {
        paid[c.member] += c.amount
      }
    }
    for (const s of bill.shares) {
      if (owed[s.member] !== undefined) {
        owed[s.member] += s.amount
      }
    }
  }

  // Completed settlements adjust net positions
  for (const s of settlements) {
    if (s.status !== 'completed') continue
    if (paid[s.payer] !== undefined) paid[s.payer] += s.amount
    if (owed[s.receiver] !== undefined) owed[s.receiver] += s.amount
  }

  return memberAddresses.map(addr => ({
    member: addr,
    displayName: displayNames[addr] ?? addr,
    netBalance: (paid[addr] ?? 0) - (owed[addr] ?? 0),
  }))
}

/**
 * Validate that balances sum to zero (money is conserved).
 */
export function balancesAreConserved(balances: MemberBalance[]): boolean {
  const sum = balances.reduce((acc, b) => acc + b.netBalance, 0)
  return sum === 0
}

/**
 * Return true if all members have a zero net balance.
 */
export function allSettled(balances: MemberBalance[]): boolean {
  return balances.every(b => b.netBalance === 0)
}

/**
 * Total amount owed (sum of all negative balances, returned as positive number).
 */
export function totalOwed(balances: MemberBalance[]): number {
  return balances.reduce((acc, b) => (b.netBalance < 0 ? acc + Math.abs(b.netBalance) : acc), 0)
}

/**
 * Total amount to be received (sum of all positive balances).
 */
export function totalToReceive(balances: MemberBalance[]): number {
  return balances.reduce((acc, b) => (b.netBalance > 0 ? acc + b.netBalance : acc), 0)
}
