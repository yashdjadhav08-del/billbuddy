import { describe, it, expect } from 'vitest'
import { optimizeSettlements, verifyTransfers } from '@/lib/settlement'
import type { MemberBalance } from '@/types'

function mb(member: string, displayName: string, netBalance: number): MemberBalance {
  return { member, displayName, netBalance }
}

describe('optimizeSettlements', () => {
  it('returns empty for all-zero balances', () => {
    const result = optimizeSettlements([
      mb('A', 'Alice', 0), mb('B', 'Bob', 0),
    ])
    expect(result).toEqual([])
  })

  it('single debtor → single creditor', () => {
    const transfers = optimizeSettlements([
      mb('A', 'Alice', 5000),
      mb('B', 'Bob', -5000),
    ])
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({ from: 'B', to: 'A', amount: 5000 })
  })

  it('spec example: Alice+57500, Bob-12500, Charlie-22500, David-22500', () => {
    const balances = [
      mb('alice',   'Alice',   57500),
      mb('bob',     'Bob',    -12500),
      mb('charlie', 'Charlie', -22500),
      mb('david',   'David',   -22500),
    ]
    const transfers = optimizeSettlements(balances)

    // All balances must zero out
    expect(verifyTransfers(balances, transfers)).toBe(true)

    // Total transferred must equal total debt
    const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0)
    const totalDebt = balances
      .filter(b => b.netBalance < 0)
      .reduce((s, b) => s + Math.abs(b.netBalance), 0)
    expect(totalTransferred).toBe(totalDebt)
  })

  it('multiple creditors and debtors are resolved correctly', () => {
    const balances = [
      mb('A', 'Alice', 10000),
      mb('B', 'Bob', 2000),
      mb('C', 'Charlie', -7000),
      mb('D', 'David', -5000),
    ]
    const transfers = optimizeSettlements(balances)
    expect(verifyTransfers(balances, transfers)).toBe(true)
  })

  it('preserves money — no creation or loss', () => {
    const balances = [
      mb('A', 'Alice', 93000),
      mb('B', 'Bob', -25000),
      mb('C', 'Charlie', -30000),
      mb('D', 'David', -38000),
    ]
    const transfers = optimizeSettlements(balances)
    const inflow  = transfers.reduce((s, t) => s + t.amount, 0)
    const outflow = transfers.reduce((s, t) => s + t.amount, 0)
    expect(inflow).toBe(outflow)
    expect(verifyTransfers(balances, transfers)).toBe(true)
  })

  it('handles rounding remainders without creating extra transfers', () => {
    // Odd-cent scenario
    const balances = [
      mb('A', 'Alice', 1),
      mb('B', 'Bob', -1),
    ]
    const transfers = optimizeSettlements(balances)
    expect(transfers).toHaveLength(1)
    expect(transfers[0].amount).toBe(1)
    expect(verifyTransfers(balances, transfers)).toBe(true)
  })

  it('is deterministic — same input produces same output', () => {
    const balances = [
      mb('A', 'Alice', 5000),
      mb('B', 'Bob', 3000),
      mb('C', 'Charlie', -4000),
      mb('D', 'David', -4000),
    ]
    const r1 = optimizeSettlements(balances)
    const r2 = optimizeSettlements(balances)
    expect(r1).toEqual(r2)
  })

  it('never pays a creditor more than their credit', () => {
    const balances = [
      mb('A', 'Alice', 2000),
      mb('B', 'Bob', -1000),
      mb('C', 'Charlie', -1000),
    ]
    const transfers = optimizeSettlements(balances)
    const totalToAlice = transfers
      .filter(t => t.to === 'A')
      .reduce((s, t) => s + t.amount, 0)
    expect(totalToAlice).toBeLessThanOrEqual(2000)
    expect(verifyTransfers(balances, transfers)).toBe(true)
  })

  it('never makes a debtor pay more than their debt', () => {
    const balances = [
      mb('A', 'Alice', 3000),
      mb('B', 'Bob', -1000),
      mb('C', 'Charlie', -2000),
    ]
    const transfers = optimizeSettlements(balances)
    const bobPays = transfers
      .filter(t => t.from === 'B')
      .reduce((s, t) => s + t.amount, 0)
    expect(bobPays).toBeLessThanOrEqual(1000)
  })
})

describe('verifyTransfers', () => {
  it('returns true for correct transfers', () => {
    const balances = [mb('A', 'Alice', 100), mb('B', 'Bob', -100)]
    const transfers = [{ from: 'B', fromName: 'Bob', to: 'A', toName: 'Alice', amount: 100 }]
    expect(verifyTransfers(balances, transfers)).toBe(true)
  })

  it('returns false for incorrect transfers', () => {
    const balances = [mb('A', 'Alice', 100), mb('B', 'Bob', -100)]
    const transfers = [{ from: 'B', fromName: 'Bob', to: 'A', toName: 'Alice', amount: 50 }]
    expect(verifyTransfers(balances, transfers)).toBe(false)
  })
})
