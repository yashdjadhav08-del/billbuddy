import '@testing-library/jest-dom'
import { vi, beforeEach, afterEach } from 'vitest'

// Mock Freighter API — never make real wallet calls in tests
vi.mock('@stellar/freighter-api', () => ({
  isConnected:     vi.fn().mockResolvedValue({ isConnected: false }),
  getAddress:      vi.fn().mockResolvedValue({ address: null }),
  getNetworkDetails: vi.fn().mockResolvedValue({ network: 'TESTNET' }),
  requestAccess:   vi.fn().mockResolvedValue({ address: 'GABC123' }),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'mock-xdr' }),
}))

// Mock Stellar SDK Horizon
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk')
  return {
    ...actual,
    Horizon: {
      Server: vi.fn().mockImplementation(() => ({
        loadAccount: vi.fn().mockResolvedValue({
          balances: [{ asset_type: 'native', balance: '1000.0000000' }],
        }),
        submitTransaction: vi.fn().mockResolvedValue({ hash: 'mock-tx-hash' }),
        transactions: vi.fn().mockReturnValue({
          transaction: vi.fn().mockReturnValue({ call: vi.fn().mockResolvedValue({}) }),
        }),
      })),
    },
  }
})

// Silence console.error in tests unless needed
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})
afterEach(() => {
  console.error = originalConsoleError
})
