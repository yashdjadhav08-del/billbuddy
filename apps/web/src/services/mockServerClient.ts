/**
 * Client for the shared mock-state server (see mock-server.mjs).
 * In mock mode this server is the single shared source of truth, so every
 * connected account/browser/device sees the same live household, bills and
 * settlements — exactly like a shared on-chain ledger.
 */

import type { Household, Bill, Settlement } from '@/types'

export interface MockState {
  household: Household | null
  bills: Bill[]
  settlements: Settlement[]
}

export const EMPTY_STATE: MockState = {
  household: null,
  bills: [],
  settlements: [],
}

// In dev, Vite proxies /api to the mock server (127.0.0.1:8787).
// For a remote shared server, set VITE_MOCK_SERVER_URL.
const BASE = import.meta.env.VITE_MOCK_SERVER_URL ?? '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    throw new Error(`Shared state server unreachable (HTTP ${res.status}). Is mock-server running?`)
  }
  return (await res.json()) as T
}

export const mockServerApi = {
  async getState(): Promise<MockState> {
    const res = await request<{ state: MockState }>('/state')
    return res.state
  },

  /** Merge a partial state update into the shared server state. */
  async updateState(partial: Partial<MockState>): Promise<MockState> {
    const res = await request<{ state: MockState }>('/state', {
      method: 'POST',
      body: JSON.stringify({ state: partial }),
    })
    return res.state
  },

  /** Permanently remove bills by id from the shared server state. */
  async removeBills(billIds: number[]): Promise<MockState> {
    const res = await request<{ state: MockState }>('/state', {
      method: 'POST',
      body: JSON.stringify({ remove: { bills: billIds } }),
    })
    return res.state
  },
}