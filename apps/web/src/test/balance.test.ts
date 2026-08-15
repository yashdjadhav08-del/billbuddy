import { describe, it, expect } from 'vitest'
import { calculateBalances, balancesAreConserved, allSettled, totalOwed } from '@/lib/balance'
import type { Bill, Settlement } from '@/types'

const ALICE   = 'GALICE000000000000000000000000000000000000000000000000001'
const BOB     = 'GBOB0000000000000000000000000000000000000000000000000000002'
const CHARLIE = 'GCHARLIE00000000000000000000000000000000000000000000000003'
const DAVID   = 'GDAVID000000000000000000000000000000000000000000000000000004'

const names: Record<string, string> = {
  [ALICE]: 'Alice', [BOB]: 'Bob', [CHARLIE]: 'Charlie', [DAVID]: 'David',
}
const members = [ALICE, BOB, CHARLIE, DAVID]

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 1, householdId: 1, title: 'Test', category: 'rent',
    totalAmount: 10000, creator: ALICE,
    createdAt: 0, dueDate: 0, splitType: 'equal',
    shares: [], contributions: [], status: 'active',
    ...overrides,
  }
}

describe('calculateBalances', () => {
  it('returns zero balances with no bills', () => {
    const balances = calculateBalances(members, [], [], names)
    expect(balances.every(b => b.netBalance === 0)).toBe(true)
  })

  it('correctly calculates who owes whom — spec example', () => {
    // $930 total, 4-way split = $232.50 each
    // Alice paid $800 (rent), Bob paid $100 (elec+water), Charlie/David paid $0
    const bills: Bill[] = [
      makeBill({
        id: 1, totalAmount: 80000,
        shares: members.map(m => ({ member: m, amount: 20000 })),
        contributions: [
          { member: ALICE, amount: 80000 },
          { member: BOB, amount: 0 },
          { member: CHARLIE, amount: 0 },
          { member: DAVID, amount: 0 },
        ],
      }),
      makeBill({
        id: 2, totalAmount: 7200,
        shares: members.map(m => ({ member: m, amount: 1800 })),
        contributions: [
          { member: ALICE, amount: 0 },
          { member: BOB, amount: 7200 },
          { member: CHARLIE, amount: 0 },
          { member: DAVID, amount: 0 },
        ],
      }),
      makeBill({
        id: 3, totalAmount: 2800,
        shares: members.map(m => ({ member: m, amount: 700 })),
        contributions: [
          { member: ALICE, amount: 0 },
          { member: BOB, amount: 2800 },
          { member: CHARLIE, amount: 0 },
          { member: DAVID, amount: 0 },
        ],
      }),
    ]

    const balances = calculateBalances(members, bills, [], names)
    const byMember = Object.fromEntries(balances.map(b => [b.member, b.netBalance]))

    // Alice: paid 80000, owed 20000+1800+700=22500 → net +57500
    expect(byMember[ALICE]).toBe(57500)
    // Bob: paid 10000, owed 22500 → net -12500
    expect(byMember[BOB]).toBe(-12500)
    // Charlie: paid 0, owed 22500 → net -22500
    expect(byMember[CHARLIE]).toBe(-22500)
    // David: same as Charlie
    expect(byMember[DAVID]).toBe(-22500)
  })

  it('balances always sum to zero (conservation law)', () => {
    const bills: Bill[] = [
      makeBill({
        totalAmount: 9300,
        shares: members.map(m => ({ member: m, amount: 2325 })),
        contributions: [
          { member: ALICE, amount: 9300 },
          { member: BOB, amount: 0 },
          { member: CHARLIE, amount: 0 },
          { member: DAVID, amount: 0 },
        ],
      }),
    ]
    const balances = calculateBalances(members, bills, [], names)
    expect(balancesAreConserved(balances)).toBe(true)
  })

  it('completed settlements reduce outstanding balances', () => {
    const bill: Bill = makeBill({
      totalAmount: 10000,
      shares: [
        { member: ALICE, amount: 5000 },
        { member: BOB, amount: 5000 },
      ],
      contributions: [
        { member: ALICE, amount: 10000 },
        { member: BOB, amount: 0 },
      ],
    })

    const settlement: Settlement = {
      id: 1, householdId: 1,
      payer: BOB, receiver: ALICE,
      amount: 5000, asset: 'XLM',
      status: 'completed',
      createdAt: 0, transactionHash: 'abc123',
    }

    const before = calculateBalances([ALICE, BOB], [bill], [], names)
    const after  = calculateBalances([ALICE, BOB], [bill], [settlement], names)

    const aliceBefore = before.find(b => b.member === ALICE)!
    const aliceAfter  = after.find(b => b.member === ALICE)!
    const bobBefore   = before.find(b => b.member === BOB)!
    const bobAfter    = after.find(b => b.member === BOB)!

    expect(aliceBefore.netBalance).toBe(5000)
    expect(aliceAfter.netBalance).toBe(0)
    expect(bobBefore.netBalance).toBe(-5000)
    expect(bobAfter.netBalance).toBe(0)
  })

  it('pending settlements do NOT affect balances', () => {
    const bill: Bill = makeBill({
      totalAmount: 10000,
      shares: [{ member: ALICE, amount: 5000 }, { member: BOB, amount: 5000 }],
      contributions: [{ member: ALICE, amount: 10000 }, { member: BOB, amount: 0 }],
    })
    const pending: Settlement = {
      id: 1, householdId: 1, payer: BOB, receiver: ALICE,
      amount: 5000, asset: 'XLM', status: 'pending',
      createdAt: 0, transactionHash: '',
    }
    const balances = calculateBalances([ALICE, BOB], [bill], [pending], names)
    const bob = balances.find(b => b.member === BOB)!
    expect(bob.netBalance).toBe(-5000) // still owes
  })

  it('settled bills are excluded from balance calculation', () => {
    const bill: Bill = makeBill({
      status: 'settled',
      shares: members.map(m => ({ member: m, amount: 2500 })),
      contributions: [
        { member: ALICE, amount: 10000 },
        { member: BOB, amount: 0 },
        { member: CHARLIE, amount: 0 },
        { member: DAVID, amount: 0 },
      ],
    })
    const balances = calculateBalances(members, [bill], [], names)
    expect(balances.every(b => b.netBalance === 0)).toBe(true)
  })
})

describe('allSettled', () => {
  it('returns true when all zero', () => {
    expect(allSettled([
      { member: ALICE, displayName: 'Alice', netBalance: 0 },
      { member: BOB,   displayName: 'Bob',   netBalance: 0 },
    ])).toBe(true)
  })

  it('returns false when any non-zero', () => {
    expect(allSettled([
      { member: ALICE, displayName: 'Alice', netBalance: 100 },
      { member: BOB,   displayName: 'Bob',   netBalance: -100 },
    ])).toBe(false)
  })
})

describe('totalOwed', () => {
  it('sums only negative balances as positive', () => {
    const balances = [
      { member: ALICE, displayName: 'Alice', netBalance: 100 },
      { member: BOB,   displayName: 'Bob',   netBalance: -60 },
      { member: CHARLIE, displayName: 'Charlie', netBalance: -40 },
    ]
    expect(totalOwed(balances)).toBe(100)
  })

  it('returns 0 when all positive', () => {
    expect(totalOwed([{ member: ALICE, displayName: 'Alice', netBalance: 50 }])).toBe(0)
  })
})
