import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { Bill, Household, Settlement } from '@/types'

// Load the service with VITE_MOCK_MODE=true so we exercise the mock branch.
vi.stubEnv('VITE_MOCK_MODE', 'true')

// Mock the real 400-700ms mock-mode latency so tests run instantly.
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils')
  return { ...actual, sleep: vi.fn(() => Promise.resolve()) }
})

// ─── In-memory stand-in for the shared mock-state server (mock-server.mjs) ────
// Mirrors the server's exact merge semantics: `state` arrays are unioned by id
// (upsert), then `remove` deletes the listed ids explicitly.

let serverState: { household: Household | null; bills: Bill[]; settlements: Settlement[] }

function mergeById<T extends { id: number }>(prev: T[], next: T[]): T[] {
  const map = new Map<number, T>()
  for (const x of prev) map.set(x.id, x)
  for (const x of next) if (x && x.id != null) map.set(x.id, x)
  return Array.from(map.values()).sort((a, b) => a.id - b.id)
}

function installFetchMock() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (!url.endsWith('/api/state')) {
        throw new Error(`unexpected fetch in test: ${method} ${url}`)
      }
      if (method === 'POST') {
        const parsed = JSON.parse(String(init?.body)) as {
          state?: Partial<typeof serverState>
          remove?: { bills?: number[]; settlements?: number[] }
        }
        const incoming = parsed.state ?? {}
        const remove = parsed.remove ?? {}
        serverState = {
          household: incoming.household ?? serverState.household ?? null,
          bills: mergeById(serverState.bills, incoming.bills ?? []).filter(
            b => !(remove.bills ?? []).includes(b.id),
          ),
          settlements: mergeById(serverState.settlements, incoming.settlements ?? []).filter(
            s => !(remove.settlements ?? []).includes(s.id),
          ),
        }
      }
      return new Response(JSON.stringify({ state: serverState }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
}

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: 1,
    name: 'Test Flat',
    owner: 'G-OWNER',
    createdAt: 0,
    active: true,
    periodClosed: false,
    periodLabel: 'Jul 2026',
    members: [],
    ...overrides,
  }
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 1,
    householdId: 1,
    title: 'Electricity',
    category: 'electricity',
    totalAmount: 6000,
    creator: 'G-CREATOR',
    createdAt: 100,
    dueDate: 200,
    splitType: 'equal',
    shares: [],
    contributions: [],
    status: 'active',
    ...overrides,
  }
}

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 1,
    householdId: 1,
    payer: 'G-PAYER',
    receiver: 'G-RECEIVER',
    amount: 2500,
    asset: 'XLM',
    status: 'pending',
    createdAt: 100,
    transactionHash: '',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

type ContractServiceModule = typeof import('@/services/contractService')
let service: ContractServiceModule['contractService']

beforeAll(async () => {
  const mod = await import('@/services/contractService')
  service = mod.contractService
})

beforeEach(() => {
  serverState = { household: makeHousehold(), bills: [makeBill()], settlements: [] }
  installFetchMock()
})

describe('contractService.deleteBill (mock mode)', () => {
  it('lets the bill creator delete their own bill', async () => {
    await service.deleteBill(1, 1, 'G-CREATOR')

    expect(serverState.bills).toHaveLength(0)
  })

  it('lets the household owner delete a bill they did not create', async () => {
    await service.deleteBill(1, 1, 'G-OWNER')

    expect(serverState.bills).toHaveLength(0)
  })

  it('rejects a caller who is neither creator nor owner', async () => {
    await expect(service.deleteBill(1, 1, 'G-STRANGER')).rejects.toThrow(
      'Only the bill creator or household owner can delete this bill',
    )

    expect(serverState.bills).toHaveLength(1)
  })

  it('rejects deletion of a bill that does not exist', async () => {
    await expect(service.deleteBill(1, 999, 'G-OWNER')).rejects.toThrow('Bill not found')
  })

  it('rejects deletion of a settled bill', async () => {
    serverState = {
      household: makeHousehold(),
      bills: [makeBill({ status: 'settled' })],
      settlements: [],
    }

    await expect(service.deleteBill(1, 1, 'G-CREATOR')).rejects.toThrow(
      'Settled bills cannot be deleted',
    )

    expect(serverState.bills).toHaveLength(1)
  })

  it('does not touch bills from other households', async () => {
    const other = makeBill({ id: 2, householdId: 2 })
    serverState.bills.push(other)

    await service.deleteBill(1, 1, 'G-OWNER')

    expect(serverState.bills).toEqual([other])
  })
})

describe('contractService.payBill (mock mode)', () => {
  it('marks a bill settled once every participant has paid their share', async () => {
    serverState = {
      household: makeHousehold({
        members: [
          { address: 'G-OWNER', displayName: 'Owner', joinedAt: 0, active: true },
          { address: 'G-ALICE', displayName: 'Alice', joinedAt: 0, active: true },
        ],
      }),
      bills: [
        makeBill({
          title: 'Dinner',
          totalAmount: 10000,
          shares: [
            { member: 'G-OWNER', amount: 5000 },
            { member: 'G-ALICE', amount: 5000 },
          ],
          contributions: [
            { member: 'G-OWNER', amount: 10000 },
            { member: 'G-ALICE', amount: 0 },
          ],
          status: 'active',
        }),
      ],
      settlements: [],
    }

    await service.payBill(1, 1, 'G-ALICE', 5000)

    expect(serverState.bills[0].status).toBe('settled')
  })

  it('keeps a bill active while a participant still owes a share', async () => {
    serverState = {
      household: makeHousehold({
        members: [
          { address: 'G-OWNER', displayName: 'Owner', joinedAt: 0, active: true },
          { address: 'G-ALICE', displayName: 'Alice', joinedAt: 0, active: true },
          { address: 'G-BOB', displayName: 'Bob', joinedAt: 0, active: true },
        ],
      }),
      bills: [
        makeBill({
          shares: [
            { member: 'G-OWNER', amount: 4000 },
            { member: 'G-ALICE', amount: 3000 },
            { member: 'G-BOB', amount: 3000 },
          ],
          contributions: [
            { member: 'G-OWNER', amount: 10000 },
            { member: 'G-ALICE', amount: 0 },
            { member: 'G-BOB', amount: 0 },
          ],
          status: 'active',
        }),
      ],
      settlements: [],
    }

    await service.payBill(1, 1, 'G-ALICE', 3000)

    expect(serverState.bills[0].status).toBe('active')
  })
})

describe('contractService.removeMember (mock mode)', () => {
  beforeEach(() => {
    serverState = {
      household: makeHousehold({
        members: [
          { address: 'G-OWNER', displayName: 'Owner', joinedAt: 0, active: true },
          { address: 'G-ALICE', displayName: 'Alice', joinedAt: 0, active: true },
        ],
      }),
      bills: [],
      settlements: [],
    }
  })

  it('lets the owner deactivate a member', async () => {
    await service.removeMember(1, 'G-OWNER', 'G-ALICE')

    const alice = serverState.household!.members.find(m => m.address === 'G-ALICE')
    expect(alice?.active).toBe(false)
  })

  it('rejects a non-owner caller', async () => {
    await expect(service.removeMember(1, 'G-ALICE', 'G-OWNER')).rejects.toThrow(
      'Only the household owner can remove members',
    )

    expect(serverState.household!.members.every(m => m.active)).toBe(true)
  })

  it('rejects removing the household owner', async () => {
    await expect(service.removeMember(1, 'G-OWNER', 'G-OWNER')).rejects.toThrow(
      'The household owner cannot be removed',
    )
  })

  it('rejects an unknown member address', async () => {
    await expect(service.removeMember(1, 'G-OWNER', 'G-STRANGER')).rejects.toThrow(
      'Member not found',
    )
  })
})

describe('contractService settlements (mock mode)', () => {
  beforeEach(() => {
    serverState = { household: makeHousehold(), bills: [], settlements: [] }
  })

  it('createSettlement rejects a duplicate pending settlement', async () => {
    serverState.settlements = [makeSettlement()]

    await expect(service.createSettlement(1, 'G-PAYER', 'G-RECEIVER', 2500)).rejects.toThrow(
      'Duplicate settlement',
    )
  })

  it('createSettlement allows a different amount', async () => {
    serverState.settlements = [makeSettlement()]

    const created = await service.createSettlement(1, 'G-PAYER', 'G-RECEIVER', 999)

    expect(created.status).toBe('pending')
    expect(serverState.settlements).toHaveLength(2)
  })

  it('completeSettlement rejects a caller who is not the payer', async () => {
    serverState.settlements = [makeSettlement()]

    await expect(service.completeSettlement(1, 1, 'G-RECEIVER', 'hash')).rejects.toThrow(
      'Only the payer can complete this settlement',
    )
  })

  it('completeSettlement rejects an already completed settlement', async () => {
    serverState.settlements = [makeSettlement({ status: 'completed' })]

    await expect(service.completeSettlement(1, 1, 'G-PAYER', 'hash')).rejects.toThrow(
      'Settlement is already completed',
    )
  })

  it('failSettlement rejects a completed settlement', async () => {
    serverState.settlements = [makeSettlement({ status: 'completed' })]

    await expect(service.failSettlement(1, 1, 'G-PAYER')).rejects.toThrow(
      'Settlement is already completed',
    )
  })

  it('completeSettlement records the transaction hash', async () => {
    serverState.settlements = [makeSettlement()]

    const completed = await service.completeSettlement(1, 1, 'G-PAYER', 'abc123')

    expect(completed.status).toBe('completed')
    expect(completed.transactionHash).toBe('abc123')
  })

  it('paySettlement completes a pending settlement (on-chain path)', async () => {
    serverState.settlements = [makeSettlement()]

    const settled = await service.paySettlement(1, 1, 'G-PAYER', 'CA-TokenContract')

    expect(settled.status).toBe('completed')
    expect(serverState.settlements[0].status).toBe('completed')
  })

  it('paySettlement rejects a caller who is not the payer', async () => {
    serverState.settlements = [makeSettlement()]

    await expect(service.paySettlement(1, 1, 'G-RECEIVER', 'CA-TokenContract')).rejects.toThrow(
      'Only the payer can settle this payment',
    )
  })

  it('paySettlement rejects an already completed settlement', async () => {
    serverState.settlements = [makeSettlement({ status: 'completed' })]

    await expect(service.paySettlement(1, 1, 'G-PAYER', 'CA-TokenContract')).rejects.toThrow(
      'Settlement is already completed',
    )
  })

  it('getTokenBalance is a no-op in mock mode', async () => {
    await expect(service.getTokenBalance('G-PAYER', 'CA-TokenContract')).resolves.toBe(0)
  })
})

describe('contractService.updateBill (mock mode)', () => {
  const input = {
    title: 'Renamed',
    category: 'rent' as const,
    totalAmount: 7000,
    dueDate: 0,
    splitType: 'equal' as const,
    shares: [],
    contributions: [],
  }

  beforeEach(() => {
    serverState = { household: makeHousehold(), bills: [makeBill()], settlements: [] }
  })

  it('lets the creator update their own bill', async () => {
    const updated = await service.updateBill(1, 1, 'G-CREATOR', input)

    expect(updated.title).toBe('Renamed')
    expect(serverState.bills[0].title).toBe('Renamed')
  })

  it('rejects a caller who is neither creator nor owner', async () => {
    await expect(service.updateBill(1, 1, 'G-STRANGER', input)).rejects.toThrow(
      'Only the bill creator or household owner can update this bill',
    )

    expect(serverState.bills[0].title).toBe('Electricity')
  })

  it('rejects updating a settled bill', async () => {
    serverState.bills = [makeBill({ status: 'settled' })]

    await expect(service.updateBill(1, 1, 'G-CREATOR', input)).rejects.toThrow(
      'Settled bills cannot be updated',
    )
  })
})
