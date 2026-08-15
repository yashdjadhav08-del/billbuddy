import { describe, it, expect } from 'vitest'
import { validateShares, buildEqualShares, buildPercentageShares } from '@/lib/split'
import type { MemberShare } from '@/types'

const MEMBERS = ['ALICE', 'BOB', 'CHARLIE', 'DAVID']

describe('validateShares', () => {
  it('accepts a valid equal split', () => {
    const shares: MemberShare[] = MEMBERS.map(m => ({ member: m, amount: 2500 }))
    expect(validateShares(shares, 10000, 'equal').valid).toBe(true)
  })

  it('rejects a split that does not sum to total', () => {
    const shares: MemberShare[] = [
      { member: 'ALICE', amount: 5000 },
      { member: 'BOB',   amount: 4000 },  // should be 5000
    ]
    const result = validateShares(shares, 10000, 'custom_amount')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('9000')
  })

  it('rejects empty shares list', () => {
    const result = validateShares([], 10000, 'equal')
    expect(result.valid).toBe(false)
  })

  it('rejects zero total amount', () => {
    const shares: MemberShare[] = [{ member: 'ALICE', amount: 0 }]
    const result = validateShares(shares, 0, 'equal')
    expect(result.valid).toBe(false)
  })

  it('rejects negative share amounts', () => {
    const shares: MemberShare[] = [
      { member: 'ALICE', amount: -100 },
      { member: 'BOB',   amount: 10100 },
    ]
    const result = validateShares(shares, 10000, 'custom_amount')
    expect(result.valid).toBe(false)
  })

  it('validates percentage split using resolved cent amounts', () => {
    // 40/30/20/10 of $100 = 40/30/20/10 cents
    const shares: MemberShare[] = [
      { member: 'ALICE',   amount: 4000 },
      { member: 'BOB',     amount: 3000 },
      { member: 'CHARLIE', amount: 2000 },
      { member: 'DAVID',   amount: 1000 },
    ]
    expect(validateShares(shares, 10000, 'percentage').valid).toBe(true)
  })
})

describe('buildEqualShares', () => {
  it('builds exact equal shares', () => {
    const shares = buildEqualShares(MEMBERS, 10000)
    expect(shares).toHaveLength(4)
    expect(shares.every(s => s.amount === 2500)).toBe(true)
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(10000)
  })

  it('distributes remainder one cent at a time', () => {
    // $930 / 4 = $232.50 → 93000 / 4 = 23250 each (exact)
    const shares = buildEqualShares(MEMBERS, 93000)
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(93000)
    expect(shares.every(s => s.amount === 23250)).toBe(true)
  })

  it('handles odd cents', () => {
    // 10001 / 4 = 2500 r 1 → [2501, 2500, 2500, 2500]
    const shares = buildEqualShares(MEMBERS, 10001)
    expect(shares[0].amount).toBe(2501)
    expect(shares.slice(1).every(s => s.amount === 2500)).toBe(true)
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(10001)
  })
})

describe('buildPercentageShares', () => {
  it('builds correct percentage shares', () => {
    const shares = buildPercentageShares(MEMBERS, [40, 30, 20, 10], 10000)
    expect(shares.find(s => s.member === 'ALICE')!.amount).toBe(4000)
    expect(shares.find(s => s.member === 'BOB')!.amount).toBe(3000)
    expect(shares.find(s => s.member === 'CHARLIE')!.amount).toBe(2000)
    expect(shares.find(s => s.member === 'DAVID')!.amount).toBe(1000)
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(10000)
  })

  it('total always preserved with rounding', () => {
    // 33/33/34 percent of $100
    const members = ['A', 'B', 'C']
    const shares = buildPercentageShares(members, [33, 33, 34], 10000)
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(10000)
  })

  it('throws if percentages do not sum to 100', () => {
    expect(() => buildPercentageShares(MEMBERS, [25, 25, 25, 24], 10000)).toThrow()
  })
})
