/**
 * Mock data for local development / demo mode (VITE_MOCK_MODE=true).
 * Pre-seeded Apartment 204 scenario matching the spec.
 */

import type { Household, Bill, Settlement } from '@/types'

// Deterministic demo addresses (not real accounts)
export const DEMO_ADDRESSES = {
  alice:   'GABC1ALICE000000000000000000000000000000000000000000ALICE1',
  bob:     'GABC2BOB0000000000000000000000000000000000000000000000BOB2',
  charlie: 'GABC3CHARLIE00000000000000000000000000000000000000CHARLIE3',
  david:   'GABC4DAVID000000000000000000000000000000000000000000DAVID4',
}

const aug1 = Math.floor(new Date('2026-08-01').getTime() / 1000)
const aug31 = Math.floor(new Date('2026-08-31').getTime() / 1000)

export const MOCK_HOUSEHOLD: Household = {
  id: 1,
  name: 'Apartment 204',
  owner: DEMO_ADDRESSES.alice,
  createdAt: aug1,
  active: true,
  periodClosed: false,
  periodLabel: '',
  members: [
    { address: DEMO_ADDRESSES.alice,   displayName: 'Alice',   joinedAt: aug1, active: true },
    { address: DEMO_ADDRESSES.bob,     displayName: 'Bob',     joinedAt: aug1, active: true },
    { address: DEMO_ADDRESSES.charlie, displayName: 'Charlie', joinedAt: aug1, active: true },
    { address: DEMO_ADDRESSES.david,   displayName: 'David',   joinedAt: aug1, active: true },
  ],
}

// $930 total, 4-way split = $232.50 each
// Alice paid Rent $800, Bob paid Electricity $72 + Water $28 = $100, Internet unpaid
export const MOCK_BILLS: Bill[] = [
  {
    id: 1,
    householdId: 1,
    title: 'Rent',
    category: 'rent',
    totalAmount: 80000,   // $800.00
    creator: DEMO_ADDRESSES.alice,
    createdAt: aug1,
    dueDate: aug31,
    splitType: 'equal',
    shares: [
      { member: DEMO_ADDRESSES.alice,   amount: 20000 },
      { member: DEMO_ADDRESSES.bob,     amount: 20000 },
      { member: DEMO_ADDRESSES.charlie, amount: 20000 },
      { member: DEMO_ADDRESSES.david,   amount: 20000 },
    ],
    contributions: [
      { member: DEMO_ADDRESSES.alice,   amount: 80000 },
      { member: DEMO_ADDRESSES.bob,     amount: 0 },
      { member: DEMO_ADDRESSES.charlie, amount: 0 },
      { member: DEMO_ADDRESSES.david,   amount: 0 },
    ],
    status: 'active',
  },
  {
    id: 2,
    householdId: 1,
    title: 'Electricity',
    category: 'electricity',
    totalAmount: 7200,    // $72.00
    creator: DEMO_ADDRESSES.bob,
    createdAt: aug1,
    dueDate: aug31,
    splitType: 'equal',
    shares: [
      { member: DEMO_ADDRESSES.alice,   amount: 1800 },
      { member: DEMO_ADDRESSES.bob,     amount: 1800 },
      { member: DEMO_ADDRESSES.charlie, amount: 1800 },
      { member: DEMO_ADDRESSES.david,   amount: 1800 },
    ],
    contributions: [
      { member: DEMO_ADDRESSES.alice,   amount: 0 },
      { member: DEMO_ADDRESSES.bob,     amount: 7200 },
      { member: DEMO_ADDRESSES.charlie, amount: 0 },
      { member: DEMO_ADDRESSES.david,   amount: 0 },
    ],
    status: 'active',
  },
  {
    id: 3,
    householdId: 1,
    title: 'Water',
    category: 'water',
    totalAmount: 2800,    // $28.00
    creator: DEMO_ADDRESSES.bob,
    createdAt: aug1,
    dueDate: aug31,
    splitType: 'equal',
    shares: [
      { member: DEMO_ADDRESSES.alice,   amount: 700 },
      { member: DEMO_ADDRESSES.bob,     amount: 700 },
      { member: DEMO_ADDRESSES.charlie, amount: 700 },
      { member: DEMO_ADDRESSES.david,   amount: 700 },
    ],
    contributions: [
      { member: DEMO_ADDRESSES.alice,   amount: 0 },
      { member: DEMO_ADDRESSES.bob,     amount: 2800 },
      { member: DEMO_ADDRESSES.charlie, amount: 0 },
      { member: DEMO_ADDRESSES.david,   amount: 0 },
    ],
    status: 'active',
  },
]

export const MOCK_SETTLEMENTS: Settlement[] = []
