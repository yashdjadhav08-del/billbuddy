import { describe, it, expect } from 'vitest'
import {
  toCents, formatCents, centsToString, equalSplit,
  percentageSplit, validateSplitSum, shortenAddress,
} from '@/lib/money'

describe('toCents', () => {
  it('converts integer dollars', () => expect(toCents(100)).toBe(10000))
  it('converts decimal dollars', () => expect(toCents(32.50)).toBe(3250))
  it('converts string', () => expect(toCents('32.50')).toBe(3250))
  it('handles zero', () => expect(toCents(0)).toBe(0))
  it('converts single decimal', () => expect(toCents('10.5')).toBe(1050))
  it('rounds to 2 decimal places', () => expect(toCents('9.999')).toBe(999))
})

describe('formatCents', () => {
  it('formats positive', () => expect(formatCents(3250)).toBe('$32.50'))
  it('formats negative', () => expect(formatCents(-3250)).toBe('-$32.50'))
  it('formats zero', () => expect(formatCents(0)).toBe('$0.00'))
  it('formats large amount', () => expect(formatCents(80000)).toBe('$800.00'))
  it('pads cents', () => expect(formatCents(100)).toBe('$1.00'))
})

describe('centsToString', () => {
  it('converts correctly', () => expect(centsToString(3250)).toBe('32.50'))
  it('handles zero cents', () => expect(centsToString(100)).toBe('1.00'))
})

describe('equalSplit', () => {
  it('splits evenly', () => {
    const result = equalSplit(10000, 4)
    expect(result).toEqual([2500, 2500, 2500, 2500])
    expect(result.reduce((a, b) => a + b)).toBe(10000)
  })

  it('distributes remainder correctly', () => {
    // 100 / 3 = 33.33… → [34, 33, 33]
    const result = equalSplit(100, 3)
    expect(result[0]).toBe(34)
    expect(result[1]).toBe(33)
    expect(result[2]).toBe(33)
    expect(result.reduce((a, b) => a + b)).toBe(100)
  })

  it('handles single member', () => {
    expect(equalSplit(5000, 1)).toEqual([5000])
  })

  it('handles large remainder distribution', () => {
    const result = equalSplit(93000, 4) // $930 / 4
    expect(result.reduce((a, b) => a + b)).toBe(93000)
    // Each should be 23250 exactly since 93000 is divisible by 4
    expect(result).toEqual([23250, 23250, 23250, 23250])
  })

  it('throws for zero members', () => {
    expect(() => equalSplit(100, 0)).toThrow()
  })

  it('throws for negative amount', () => {
    expect(() => equalSplit(-100, 2)).toThrow()
  })
})

describe('percentageSplit', () => {
  it('splits by percentage', () => {
    const result = percentageSplit(10000, [40, 30, 20, 10])
    expect(result).toEqual([4000, 3000, 2000, 1000])
    expect(result.reduce((a, b) => a + b)).toBe(10000)
  })

  it('distributes rounding remainder', () => {
    // $10 split 33/33/34 percent
    const result = percentageSplit(1000, [33, 33, 34])
    expect(result.reduce((a, b) => a + b)).toBe(1000)
  })

  it('throws if percentages do not sum to 100', () => {
    expect(() => percentageSplit(10000, [50, 40])).toThrow('Percentages must sum to 100')
  })

  it('handles uneven amounts preserving total', () => {
    const result = percentageSplit(9300, [25, 25, 25, 25])
    expect(result.reduce((a, b) => a + b)).toBe(9300)
  })
})

describe('validateSplitSum', () => {
  it('returns true for exact sum', () => expect(validateSplitSum([2500, 2500, 2500, 2500], 10000)).toBe(true))
  it('returns false for short sum', () => expect(validateSplitSum([2500, 2500, 2500], 10000)).toBe(false))
  it('returns false for excess', () => expect(validateSplitSum([5000, 5001], 10000)).toBe(false))
})

describe('shortenAddress', () => {
  it('shortens a long address', () => {
    const addr = 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12'
    const result = shortenAddress(addr)
    expect(result).toContain('...')
    expect(result.length).toBeLessThan(addr.length)
  })

  it('returns short addresses unchanged', () => {
    expect(shortenAddress('GABC')).toBe('GABC')
  })
})
