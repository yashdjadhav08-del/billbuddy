/**
 * Stellar transaction service.
 *
 * Builds, submits, and monitors real Stellar Testnet transactions.
 * Uses @stellar/stellar-sdk for all on-chain operations.
 *
 * Settlement asset: native XLM (simplest trustless demo asset).
 * The Soroban contract records the settlement; the Stellar Classic
 * payment actually moves XLM between accounts.
 */

import {
  Horizon,
  Operation,
  TransactionBuilder,
  Asset,
  Memo,
} from '@stellar/stellar-sdk'
import { config } from '@/config/env'
import { walletService } from './walletService'
import { sleep } from '@/lib/utils'

// Stroop = 1 XLM / 10_000_000
const STROOP = 10_000_000

export interface PaymentParams {
  from: string
  to: string
  /** Amount in minor units (cents). Converted to XLM for the transaction. */
  amount: number
  memo?: string
}

export class InsufficientBalanceError extends Error {
  constructor() {
    super(
      'Insufficient XLM balance. Fund your Testnet account at https://friendbot.stellar.org',
    )
    this.name = 'InsufficientBalanceError'
  }
}

export class TransactionTimeoutError extends Error {
  constructor() {
    super('Transaction confirmation timed out. Check the explorer for its final status.')
    this.name = 'TransactionTimeoutError'
  }
}

class StellarService {
  private horizon: Horizon.Server
  private networkPassphrase: string

  constructor() {
    this.horizon = new Horizon.Server(config.stellar.horizonUrl)
    this.networkPassphrase = config.stellar.networkPassphrase
  }

  /**
   * Convert cents to XLM string with 7 decimal places.
   * $1.00 (100 cents) → "1.0000000" XLM
   * We use a 1:1 cent-to-stroop mapping for simplicity in the demo.
   * 1 cent = 1 stroop = 0.0000001 XLM
   */
  private centsToXlmString(cents: number): string {
    // 1 cent → 1 stroop (0.0000001 XLM)
    const stroops = cents
    const xlm = stroops / STROOP
    return xlm.toFixed(7)
  }

  /**
   * Load account from Horizon with retry.
   */
  private async loadAccount(address: string): Promise<Horizon.AccountResponse> {
    try {
      return await this.horizon.loadAccount(address)
    } catch (err) {
      const msg = String(err)
      if (msg.includes('404') || msg.includes('Not Found')) {
        throw new Error(
          `Account ${address.slice(0, 8)}… not found on Testnet. ` +
          'Fund it at https://friendbot.stellar.org/?addr=' + encodeURIComponent(address),
        )
      }
      throw err
    }
  }

  /**
   * Build a payment transaction XDR and sign it via Freighter.
   * Returns the signed XDR ready for submission.
   */
  async buildAndSignPayment(params: PaymentParams): Promise<string> {
    // Verify Freighter is on the network BillBuddy is configured for.
    const details = await walletService.getNetwork()
    if (details && details.networkPassphrase && details.networkPassphrase !== config.stellar.networkPassphrase) {
      throw new Error(
        `Wrong network: Freighter is on ${details.network} but BillBuddy expects ` +
        `${config.stellar.network}. Switch networks in Freighter and try again.`,
      )
    }

    const account = await this.loadAccount(params.from)

    const amountStr = this.centsToXlmString(params.amount)
    if (parseFloat(amountStr) <= 0) {
      throw new Error('Payment amount must be greater than zero.')
    }

    // Check source balance (native XLM)
    const nativeBalance = account.balances.find(b => b.asset_type === 'native')
    const availableXlm = nativeBalance ? parseFloat(nativeBalance.balance) : 0

    // Minimum reserve check: 1 XLM base + 0.5 per entry + tx fee
    if (availableXlm < parseFloat(amountStr) + 1.5) {
      throw new InsufficientBalanceError()
    }

    const transaction = new TransactionBuilder(account, {
      fee: '100000', // 0.01 XLM max fee
      networkPassphrase: config.stellar.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: params.to,
          asset: Asset.native(),
          amount: amountStr,
        }),
      )
      .addMemo(params.memo ? Memo.text(params.memo.slice(0, 28)) : Memo.none())
      .setTimeout(300) // 5 minute window
      .build()

    const xdr = transaction.toXDR()

    // Sign with Freighter (never touches the private key here)
    const signedXdr = await walletService.signTransaction(
      xdr,
      config.stellar.networkPassphrase,
      params.from,
    )

    return signedXdr
  }

  /**
   * Submit a signed transaction XDR to Horizon.
   * Returns the transaction hash on success.
   */
  async submitTransaction(signedXdr: string): Promise<string> {
    const tx = TransactionBuilder.fromXDR(
      signedXdr,
      this.networkPassphrase,
    )
    try {
      const result = await this.horizon.submitTransaction(tx)
      return result.hash
    } catch (err) {
      // Parse Horizon error envelope for meaningful messages
      if (err && typeof err === 'object' && 'response' in err) {
        const response = (err as { response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } } }).response
        const codes = response?.data?.extras?.result_codes
        if (codes) {
          const txCode = codes.transaction ?? ''
          const opCodes = codes.operations ?? []
          if (txCode === 'tx_insufficient_fee') {
            throw new Error('Transaction fee too low. Please try again.')
          }
          if (opCodes.includes('op_underfunded')) {
            throw new InsufficientBalanceError()
          }
          if (opCodes.includes('op_no_destination')) {
            throw new Error('Destination account does not exist on Testnet. Ask them to fund it first.')
          }
          throw new Error(`Transaction failed: ${txCode} ${opCodes.join(', ')}`)
        }
      }
      throw err
    }
  }

  /**
   * Poll Horizon until the transaction is confirmed or times out.
   * Returns when the transaction has a ledger close time.
   */
  async waitForConfirmation(
    txHash: string,
    maxAttempts = 24,
    intervalMs = 2500,
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.horizon.transactions().transaction(txHash).call()
        // If we get a result without error, the transaction is confirmed
        return
      } catch (err) {
        const msg = String(err)
        if (msg.includes('404') || msg.includes('Not Found')) {
          // Not yet on chain — wait and retry
          await sleep(intervalMs)
          continue
        }
        // Any other error is a real failure
        throw err
      }
    }
    throw new TransactionTimeoutError()
  }

  /**
   * Get the XLM balance of an account.
   * Returns null if the account doesn't exist.
   */
  async getXlmBalance(address: string): Promise<number | null> {
    try {
      const account = await this.loadAccount(address)
      const native = account.balances.find(b => b.asset_type === 'native')
      return native ? parseFloat(native.balance) : 0
    } catch {
      return null
    }
  }

  /**
   * Fund an account via Friendbot (Testnet only).
   * Useful for development and demo setup.
   */
  async fundViaFriendbot(address: string): Promise<void> {
    if (config.stellar.network !== 'testnet') {
      throw new Error('Friendbot is only available on Testnet.')
    }
    const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Friendbot request failed: ${response.status}`)
    }
  }
}

export const stellarService = new StellarService()
