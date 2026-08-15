/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STELLAR_NETWORK: string
  readonly VITE_STELLAR_HORIZON_URL: string
  readonly VITE_SOROBAN_RPC_URL: string
  readonly VITE_STELLAR_NETWORK_PASSPHRASE: string
  readonly VITE_SOROBAN_CONTRACT_ID: string
  readonly VITE_ASSET_CONTRACT_ID: string
  readonly VITE_ASSET_CODE: string
  readonly VITE_ASSET_ISSUER: string
  readonly VITE_EXPLORER_BASE_URL: string
  readonly VITE_MOCK_MODE: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
