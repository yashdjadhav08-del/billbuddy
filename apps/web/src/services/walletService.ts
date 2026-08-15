/**
 * Freighter wallet integration.
 * Uses @stellar/freighter-api v2 for all wallet operations.
 * Never touches private keys — all signing done inside Freighter.
 */

// @stellar/freighter-api v2 exports default functions
import freighter from '@stellar/freighter-api'
import type { NetworkType } from '@/types'

export class WalletNotInstalledError extends Error {
  constructor() {
    super(
      'Freighter wallet is not installed. ' +
      'Please install it from https://www.freighter.app and refresh the page.',
    )
    this.name = 'WalletNotInstalledError'
  }
}

export class WalletRejectedError extends Error {
  constructor() {
    super('The transaction was rejected in Freighter. No funds were transferred.')
    this.name = 'WalletRejectedError'
  }
}

export class WrongNetworkError extends Error {
  constructor(expected: string, got: string) {
    super(
      `Wrong network: expected ${expected} but Freighter is on ${got}. ` +
      'Please switch networks in Freighter.',
    )
    this.name = 'WrongNetworkError'
  }
}

export interface WalletConnectResult {
  publicKey: string
  network: NetworkType
}

class WalletService {
  async isInstalled(): Promise<boolean> {
    try {
      // freighter-api v2: isConnected() returns Promise<boolean>
      const result = await (freighter as unknown as { isConnected: () => Promise<boolean> }).isConnected()
      return !!result
    } catch {
      return false
    }
  }

  async connect(): Promise<WalletConnectResult> {
    const installed = await this.isInstalled()
    if (!installed) throw new WalletNotInstalledError()

    // freighter-api v2 API surface (may vary by version — handled defensively)
    const api = freighter as unknown as {
      requestAccess?: () => Promise<string>
      getPublicKey?: () => Promise<string>
      getNetworkDetails?: () => Promise<{ network: string; networkPassphrase: string }>
    }

    let publicKey: string
    if (typeof api.requestAccess === 'function') {
      publicKey = await api.requestAccess()
    } else if (typeof api.getPublicKey === 'function') {
      publicKey = await api.getPublicKey()
    } else {
      throw new Error('Unable to get public key from Freighter.')
    }

    if (!publicKey) throw new WalletRejectedError()

    let networkName = 'testnet'
    if (typeof api.getNetworkDetails === 'function') {
      const details = await api.getNetworkDetails()
      networkName = (details?.network ?? 'testnet').toLowerCase()
    }

    const network: NetworkType = networkName.includes('testnet')
      ? 'testnet'
      : networkName.includes('mainnet')
      ? 'mainnet'
      : 'futurenet'

    return { publicKey, network }
  }

  async getPublicKey(): Promise<string | null> {
    try {
      const api = freighter as unknown as { getPublicKey?: () => Promise<string> }
      if (typeof api.getPublicKey === 'function') {
        return await api.getPublicKey()
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Read the currently selected network from Freighter.
   * Used to verify the user is on the network BillBuddy expects.
   */
  async getNetwork(): Promise<{ network: string; networkPassphrase: string } | null> {
    try {
      const api = freighter as unknown as {
        getNetworkDetails?: () => Promise<{ network: string; networkPassphrase: string }>
      }
      if (typeof api.getNetworkDetails === 'function') {
        return await api.getNetworkDetails()
      }
      return null
    } catch {
      return null
    }
  }

  async signTransaction(
    xdr: string,
    networkPassphrase: string,
    _accountToSign?: string,
  ): Promise<string> {
    const api = freighter as unknown as {
      signTransaction: (xdr: string, opts: { networkPassphrase?: string; accountToSign?: string }) => Promise<string>
    }

    const result = await api.signTransaction(xdr, { networkPassphrase })

    if (!result) throw new WalletRejectedError()

    const msg = typeof result === 'string' ? result : ''
    if (
      msg.toLowerCase().includes('reject') ||
      msg.toLowerCase().includes('cancel') ||
      msg.toLowerCase().includes('denied') ||
      msg.toLowerCase().includes('user declined')
    ) {
      throw new WalletRejectedError()
    }

    return result as string
  }
}

export const walletService = new WalletService()
