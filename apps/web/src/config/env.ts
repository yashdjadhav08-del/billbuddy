/**
 * Centralized environment configuration.
 * All VITE_ env vars are accessed through this module.
 */

export const config = {
  stellar: {
    network: import.meta.env.VITE_STELLAR_NETWORK ?? 'testnet',
    horizonUrl:
      import.meta.env.VITE_STELLAR_HORIZON_URL ??
      'https://horizon-testnet.stellar.org',
    sorobanRpcUrl:
      import.meta.env.VITE_SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org',
    networkPassphrase:
      import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ??
      'Test SDF Network ; September 2015',
  },
  contracts: {
    billbuddyContractId: import.meta.env.VITE_SOROBAN_CONTRACT_ID ?? '',
    assetContractId: import.meta.env.VITE_ASSET_CONTRACT_ID ?? '',
  },
  asset: {
    code: import.meta.env.VITE_ASSET_CODE ?? 'XLM',
    issuer: import.meta.env.VITE_ASSET_ISSUER ?? '',
  },
  explorer: {
    baseUrl:
      import.meta.env.VITE_EXPLORER_BASE_URL ??
      'https://stellar.expert/explorer/testnet',
  },
  flags: {
    mockMode: import.meta.env.VITE_MOCK_MODE === 'true',
  },
  app: {
    name: import.meta.env.VITE_APP_NAME ?? 'BillBuddy',
    version: import.meta.env.VITE_APP_VERSION ?? '1.0.0',
  },
} as const

export type Config = typeof config

export function getExplorerTxUrl(txHash: string): string {
  return `${config.explorer.baseUrl}/tx/${txHash}`
}

export function getExplorerAccountUrl(address: string): string {
  return `${config.explorer.baseUrl}/account/${address}`
}
