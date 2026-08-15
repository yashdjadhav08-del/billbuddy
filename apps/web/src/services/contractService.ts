/**
 * BillBuddy Soroban contract client.
 *
 * Production mode (VITE_MOCK_MODE=false):
 *   - Reads via Soroban RPC simulation (no signature required)
 *   - Writes via a real Soroban transaction: simulate → prepare → Freighter
 *     signature → submit → confirm on-chain
 *
 * Mock mode (VITE_MOCK_MODE=true) is an explicit opt-in for UI development
 * without a deployed contract. It is never silently activated and is never
 * the source of truth for a real deployment.
 */

import { config } from '@/config/env'
import { walletService } from './walletService'
import { sleep } from '@/lib/utils'
import { mockServerApi } from './mockServerClient'
import { useWalletStore } from '@/stores/walletStore'
import {
  scvAddress, scvString, scvU64, scvI128,
  splitTypeVariant, billCategoryVariant,
  memberShareScVal, memberContributionScVal,
  scvVec,
  decodeHousehold, decodeMembers, decodeBill, decodeBills,
  decodeSettlements, decodeMemberBalances,
  decodeNumber,
} from './sorobanScVal'
import type { xdr } from '@stellar/stellar-sdk'
import type {
  Bill, Household, Settlement,
} from '@/types'
import type { CreateBillInput } from '@/hooks/useBill'

// ─── Soroban RPC imports (lazy to avoid blocking startup) ─────────────────────

async function getSorobanClient() {
  const sdk = await import('@stellar/stellar-sdk')
  return {
    SorobanRpc: sdk.rpc,
    Contract: sdk.Contract,
    TransactionBuilder: sdk.TransactionBuilder,
    scValToNative: sdk.scValToNative,
  }
}

// ─── Mock mode (shared backend server) ────────────────────────────────────────
//
// In mock mode the shared state server (mock-server.mjs) is the single source
// of truth so that every connected account/browser sees the same data. It is
// ONLY used when VITE_MOCK_MODE=true.

function mockDelay() { return sleep(400 + Math.random() * 300) }

function nextId(ids: number[]): number {
  return ids.reduce((max, id) => Math.max(max, id), 0) + 1
}

/**
 * Mirror of the contract's `pay_bill` accounting for mock mode: credit the
 * payer's contribution and reduce the funders' (contribution > share) fronted
 * amounts so the contribution total stays conserved.
 */
function applyBillPayment(bill: Bill, payer: string, amount: number): Bill {
  if (amount <= 0) throw new Error('Payment amount must be greater than zero')

  const contributionOf = (address: string): number =>
    bill.contributions.find(c => c.member === address)?.amount ?? 0

  const upsertContribution = (address: string, value: number) => {
    const existing = bill.contributions.find(c => c.member === address)
    if (existing) existing.amount = value
    else bill.contributions.push({ member: address, amount: value })
  }

  const shareOf = (address: string): number =>
    bill.shares.find(s => s.member === address)?.amount ?? 0

  const share = shareOf(payer)
  if (share <= 0) throw new Error('You are not a participant of this bill')
  const outstanding = share - contributionOf(payer)
  if (outstanding <= 0) throw new Error('You already paid your share of this bill')
  if (amount > outstanding) {
    throw new Error(`Payment exceeds your outstanding share of ${outstanding}`)
  }

  const surplus = bill.shares.reduce(
    (sum, s) => sum + Math.max(contributionOf(s.member) - s.amount, 0),
    0,
  )
  if (surplus < amount) {
    throw new Error('Payment exceeds the available amount on this bill')
  }

  upsertContribution(payer, contributionOf(payer) + amount)

  let remaining = amount
  for (const s of bill.shares) {
    if (remaining <= 0) break
    const current = contributionOf(s.member)
    if (current <= s.amount) continue
    const take = Math.min(current - s.amount, remaining)
    upsertContribution(s.member, current - take)
    remaining -= take
  }

  // A bill is settled once every participant has covered their share.
  if (bill.shares.every(s => contributionOf(s.member) >= s.amount)) {
    bill.status = 'settled'
  }

  return bill
}

// ─── Production helpers ───────────────────────────────────────────────────────

function contractId(): string {
  if (!config.contracts.billbuddyContractId) {
    throw new Error(
      'Soroban contract not configured. Deploy the contract and set ' +
      'VITE_SOROBAN_CONTRACT_ID in apps/web/.env.local.',
    )
  }
  return config.contracts.billbuddyContractId
}

function connectedAddress(): string {
  const { publicKey } = useWalletStore.getState()
  if (!publicKey) {
    throw new Error('Connect your Freighter wallet first.')
  }
  return publicKey
}

class ContractService {
  private get isMock() {
    return config.flags.mockMode
  }

  private async ensureNetworkMatches(): Promise<void> {
    const details = await walletService.getNetwork()
    if (details && details.networkPassphrase && details.networkPassphrase !== config.stellar.networkPassphrase) {
      throw new Error(
        `Wrong network: Freighter is on ${details.network} but BillBuddy expects ` +
        `the ${config.stellar.network} network. Switch networks in Freighter.`,
      )
    }
  }

  /**
   * Read-only contract call. Simulates the transaction and returns the
   * result ScVal without requiring any signature or submission.
   */
  private async queryContract(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
    const id = contractId()
    const source = connectedAddress()
    await this.ensureNetworkMatches()

    const { SorobanRpc, Contract, TransactionBuilder } = await getSorobanClient()
    const server = new SorobanRpc.Server(config.stellar.sorobanRpcUrl)
    const contract = new Contract(id)
    const account = await server.getAccount(source)

    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: config.stellar.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(0)
      .build()

    const sim = await server.simulateTransaction(tx)
    if (SorobanRpc.Api.isSimulationError(sim)) {
      throw new Error(`Contract query failed (${method}): ${sim.error}`)
    }
    const retval = sim.result?.retval
    if (!retval) {
      throw new Error(`Contract query returned no value (${method}).`)
    }
    return retval
  }

  /**
   * Write call. Simulates, prepares (with the contract's suggested
   * footprint/authorizations), requests a Freighter signature, submits the
   * transaction and waits for on-chain confirmation. Returns the return ScVal.
   */
  private async invokeContract(
    method: string,
    args: xdr.ScVal[],
    signer: string,
  ): Promise<xdr.ScVal> {
    const id = contractId()
    await this.ensureNetworkMatches()

    const { SorobanRpc, Contract, TransactionBuilder } = await getSorobanClient()
    const server = new SorobanRpc.Server(config.stellar.sorobanRpcUrl)
    const contract = new Contract(id)
    const account = await server.getAccount(signer)

    // Build the invoke transaction
    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: config.stellar.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(300)
      .build()

    // Simulate first (required by Soroban)
    const simResult = await server.simulateTransaction(tx)
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Contract simulation error (${method}): ${simResult.error}`)
    }

    const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build()
    const preparedXdr = preparedTx.toXDR()

    // Sign via Freighter (never touches private keys)
    const signedXdr = await walletService.signTransaction(
      preparedXdr,
      config.stellar.networkPassphrase,
      signer,
    )

    // Submit
    const signedTx = TransactionBuilder.fromXDR(
      signedXdr,
      config.stellar.networkPassphrase,
    )
    const sendResult = await server.sendTransaction(signedTx)
    if (sendResult.status === 'ERROR') {
      throw new Error(`Contract call failed on submit (${method}). See the explorer for details.`)
    }

    // Poll for confirmation
    const hash = sendResult.hash
    for (let i = 0; i < 24; i++) {
      await sleep(2000)
      const txResult = await server.getTransaction(hash)
      if (txResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        const returnValue = txResult.returnValue
        if (!returnValue) {
          throw new Error(`Contract call succeeded but returned no value (${method}).`)
        }
        return returnValue
      }
      if (txResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Contract transaction failed on-chain (${method}).`)
      }
    }

    throw new Error(`Contract call timed out (${method}).`)
  }

  // ─── Households ─────────────────────────────────────────────────────────────

  async createHousehold(name: string, owner: string): Promise<Household> {
    if (this.isMock) {
      await mockDelay()
      const current = await mockServerApi.getState()
      const household: Household = {
        id: nextId([current.household?.id ?? 0]),
        name,
        owner,
        createdAt: Math.floor(Date.now() / 1000),
        active: true,
        periodClosed: false,
        periodLabel: '',
        members: [
          {
            address: owner,
            displayName: 'You',
            joinedAt: Math.floor(Date.now() / 1000),
            active: true,
          },
        ],
      }
      await mockServerApi.updateState({ household, bills: [], settlements: [] })
      return structuredClone(household)
    }

    await this.invokeContract(
      'create_household',
      [scvString(name), scvAddress(owner)],
      owner,
    )

    // Find the newly created household for the owner
    const ids = await this.getUserHouseholds(owner)
    const id = ids.length > 0 ? ids[0] : 1
    return this.fetchHousehold(id)
  }

  /** Load a household with its members from the contract. */
  private async fetchHousehold(id: number): Promise<Household> {
    const household = decodeHousehold(
      await this.queryContract('get_household', [scvU64(id)]),
    )
    household.members = decodeMembers(
      await this.queryContract('get_members', [scvU64(id)]),
    )
    return household
  }

  async getHousehold(id: number): Promise<Household> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      if (!state.household) throw new Error('No household exists yet.')
      return structuredClone(state.household)
    }
    return this.fetchHousehold(id)
  }

  /**
   * Discover every household where `address` is an active member.
   * The contract stores membership on-chain, so this is real cross-wallet
   * discovery: any browser/wallet can find households it belongs to by
   * querying the shared on-chain state.
   */
  async getUserHouseholds(address: string): Promise<number[]> {
    if (this.isMock) {
      const state = await mockServerApi.getState()
      if (state.household) return [state.household.id]
      return []
    }

    const found: number[] = []
    const MAX_SCAN = 12
    for (let id = 1; id <= MAX_SCAN; id++) {
      try {
        const members = decodeMembers(
          await this.queryContract('get_members', [scvU64(id)]),
        )
        if (members.some(m => m.address === address && m.active)) {
          found.push(id)
        }
      } catch {
        // No household at this id (or network hiccup) — stop probing
        if (found.length === 0) continue
        break
      }
    }
    // Newest first
    return found.sort((a, b) => b - a)
  }

  async addMember(
    householdId: number,
    caller: string,
    memberAddress: string,
    displayName: string,
  ): Promise<Household> {
    if (this.isMock) {
      await mockDelay()
      const current = (await mockServerApi.getState()).household
      if (!current) throw new Error('No household loaded')
      if (current.members.some(m => m.address === memberAddress && m.active)) {
        throw new Error('Member already exists in this household.')
      }
      const household = structuredClone(current)
      household.members.push({
        address: memberAddress,
        displayName,
        joinedAt: Math.floor(Date.now() / 1000),
        active: true,
      })
      await mockServerApi.updateState({ household })
      return structuredClone(household)
    }

    await this.invokeContract(
      'add_member',
      [scvU64(householdId), scvAddress(caller), scvAddress(memberAddress), scvString(displayName)],
      caller,
    )
    return this.fetchHousehold(householdId)
  }

  async removeMember(
    householdId: number,
    caller: string,
    memberAddress: string,
  ): Promise<Household> {
    if (this.isMock) {
      await mockDelay()
      const current = (await mockServerApi.getState()).household
      if (!current) throw new Error('No household loaded')
      if (!current.active) throw new Error('Household is inactive')
      if (current.owner !== caller) {
        throw new Error('Only the household owner can remove members')
      }
      if (memberAddress === current.owner) {
        throw new Error('The household owner cannot be removed')
      }
      if (!current.members.some(m => m.address === memberAddress)) {
        throw new Error('Member not found')
      }
      const household = structuredClone(current)
      household.members = household.members.map(m =>
        m.address === memberAddress ? { ...m, active: false } : m,
      )
      await mockServerApi.updateState({ household })
      return structuredClone(household)
    }

    await this.invokeContract(
      'remove_member',
      [scvU64(householdId), scvAddress(caller), scvAddress(memberAddress)],
      caller,
    )
    return this.fetchHousehold(householdId)
  }

  // ─── Bills ───────────────────────────────────────────────────────────────────

  async createBill(
    householdId: number,
    creator: string,
    input: CreateBillInput,
  ): Promise<Bill> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const bill: Bill = {
        id: nextId(state.bills.map(b => b.id)),
        householdId,
        title: input.title,
        category: input.category,
        totalAmount: input.totalAmount,
        creator,
        createdAt: Math.floor(Date.now() / 1000),
        dueDate: input.dueDate,
        splitType: input.splitType,
        shares: input.shares,
        contributions: input.contributions,
        status: 'active',
      }
      await mockServerApi.updateState({ bills: [...state.bills, bill] })
      return structuredClone(bill)
    }

    const billId = decodeNumber(
      await this.invokeContract(
        'create_bill',
        [
          scvU64(householdId),
          scvAddress(creator),
          scvString(input.title),
          billCategoryVariant(input.category),
          scvI128(input.totalAmount),
          scvU64(input.dueDate),
          splitTypeVariant(input.splitType),
          scvVec(input.shares.map(memberShareScVal)),
          scvVec(input.contributions.map(memberContributionScVal)),
        ],
        creator,
      ),
    )
    return this.getBill(householdId, billId)
  }

  async updateBill(
    householdId: number,
    billId: number,
    caller: string,
    input: CreateBillInput,
  ): Promise<Bill> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const current = state.bills.find(b => b.id === billId && b.householdId === householdId)
      if (!current) throw new Error('Bill not found')
      if (current.status === 'settled') {
        throw new Error('Settled bills cannot be updated')
      }
      const canUpdate = current.creator === caller || state.household?.owner === caller
      if (!canUpdate) {
        throw new Error('Only the bill creator or household owner can update this bill')
      }
      const updated: Bill = { ...structuredClone(current), ...input, id: billId }
      await mockServerApi.updateState({
        bills: state.bills.map(b => (b.id === billId && b.householdId === householdId ? updated : b)),
      })
      return structuredClone(updated)
    }

    await this.invokeContract(
      'update_bill',
      [
        scvU64(householdId),
        scvU64(billId),
        scvAddress(caller),
        scvString(input.title),
        billCategoryVariant(input.category),
        scvI128(input.totalAmount),
        scvU64(input.dueDate),
        splitTypeVariant(input.splitType),
        scvVec(input.shares.map(memberShareScVal)),
        scvVec(input.contributions.map(memberContributionScVal)),
      ],
      caller,
    )
    return this.getBill(householdId, billId)
  }

  async getBill(householdId: number, billId: number): Promise<Bill> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const bill = state.bills.find(b => b.id === billId && b.householdId === householdId)
      if (!bill) throw new Error('Bill not found')
      return structuredClone(bill)
    }
    return decodeBill(
      await this.queryContract('get_bill', [scvU64(householdId), scvU64(billId)]),
    )
  }

  /**
   * Permanently delete a bill from shared state. Only the bill creator or the
   * household owner may delete, and settled bills are locked. Removes the bill
   * everywhere: household list and every participant's member → bills index.
   */
  async deleteBill(householdId: number, billId: number, caller: string): Promise<void> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const bill = state.bills.find(b => b.id === billId && b.householdId === householdId)
      if (!bill) throw new Error('Bill not found')
      if (bill.status === 'settled') {
        throw new Error('Settled bills cannot be deleted')
      }
      const canDelete = bill.creator === caller || state.household?.owner === caller
      if (!canDelete) {
        throw new Error('Only the bill creator or household owner can delete this bill')
      }
      await mockServerApi.removeBills([billId])
      return
    }

    await this.invokeContract(
      'delete_bill',
      [scvU64(householdId), scvU64(billId), scvAddress(caller)],
      caller,
    )
  }

  async getBills(householdId: number): Promise<Bill[]> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      return structuredClone(state.bills.filter(b => b.householdId === householdId))
    }
    return decodeBills(await this.queryContract('get_bills', [scvU64(householdId)]))
  }

  /**
   * Shared-state discovery: every bill (across all households) where `address`
   * is a participant. This is how a selected wallet sees the bill — the wallet
   * address alone is enough, no household join required.
   */
  async getBillsForMember(address: string): Promise<Bill[]> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      return structuredClone(
        state.bills.filter(
          b => b.creator === address || b.shares.some(s => s.member === address),
        ),
      )
    }
    return decodeBills(
      await this.queryContract('get_member_bills', [scvAddress(address)]),
    )
  }

  /**
   * Record a participant's payment toward a bill. A real, wallet-signed Soroban
   * transaction (`pay_bill`): the payer's contribution is credited and the
   * funders' fronted amounts are reduced on-chain, flipping the bill to paid
   * for this participant. Returns the refreshed bill.
   */
  async payBill(
    householdId: number,
    billId: number,
    payer: string,
    amount: number,
  ): Promise<Bill> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const current = state.bills.find(b => b.id === billId && b.householdId === householdId)
      if (!current) throw new Error('Bill not found')
      const updated = applyBillPayment(structuredClone(current), payer, amount)
      await mockServerApi.updateState({
        bills: state.bills.map(b =>
          b.id === billId && b.householdId === householdId ? updated : b,
        ),
      })
      return structuredClone(updated)
    }

    await this.invokeContract(
      'pay_bill',
      [scvU64(householdId), scvU64(billId), scvAddress(payer), scvI128(amount)],
      payer,
    )
    return this.getBill(householdId, billId)
  }

  /** Deduplicate bills across lists by (householdId, id), newest source wins. */
  mergeBills(...lists: Bill[][]): Bill[] {
    const map = new Map<string, Bill>()
    for (const list of lists) {
      for (const bill of list) {
        map.set(`${bill.householdId}:${bill.id}`, bill)
      }
    }
    return Array.from(map.values())
  }

  // ─── Balances (on-chain truth) ──────────────────────────────────────────────

  async getBalances(householdId: number): Promise<ReturnType<typeof decodeMemberBalances>> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const members = state.household?.members ?? []
      const { calculateBalances } = await import('@/lib/balance')
      const nameMap = Object.fromEntries(members.map(m => [m.address, m.displayName]))
      return calculateBalances(
        members.map(m => m.address),
        state.bills,
        state.settlements,
        nameMap,
      )
    }
    return decodeMemberBalances(
      await this.queryContract('get_all_balances', [scvU64(householdId)]),
    )
  }

  // ─── Settlements ─────────────────────────────────────────────────────────────

  async createSettlement(
    householdId: number,
    payer: string,
    receiver: string,
    amount: number,
  ): Promise<Settlement> {
    const asset = config.asset.code

    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const duplicate = state.settlements.some(
        s =>
          s.payer === payer &&
          s.receiver === receiver &&
          s.amount === amount &&
          s.status === 'pending',
      )
      if (duplicate) {
        throw new Error('Duplicate settlement: an identical pending settlement already exists')
      }
      const settlement: Settlement = {
        id: nextId(state.settlements.map(s => s.id)),
        householdId,
        payer,
        receiver,
        amount,
        asset,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        transactionHash: '',
      }
      await mockServerApi.updateState({ settlements: [...state.settlements, settlement] })
      return structuredClone(settlement)
    }

    const id = decodeNumber(
      await this.invokeContract(
        'create_settlement',
        [
          scvU64(householdId),
          scvAddress(payer),
          scvAddress(receiver),
          scvI128(amount),
          scvString(asset),
        ],
        payer,
      ),
    )
    const settlements = await this.getSettlements(householdId)
    return settlements.find(s => s.id === id) ?? settlements[settlements.length - 1]
  }

  async completeSettlement(
    householdId: number,
    settlementId: number,
    payer: string,
    txHash: string,
  ): Promise<Settlement> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const current = state.settlements.find(
        s => s.id === settlementId && s.householdId === householdId,
      )
      if (!current) throw new Error('Settlement not found')
      if (current.payer !== payer) throw new Error('Only the payer can complete this settlement')
      if (current.status === 'completed') throw new Error('Settlement is already completed')
      if (current.status === 'failed') throw new Error('Settlement has already failed')
      const updated: Settlement = {
        ...structuredClone(current),
        status: 'completed',
        transactionHash: txHash,
      }
      await mockServerApi.updateState({
        settlements: state.settlements.map(s => (s.id === settlementId ? updated : s)),
      })
      return structuredClone(updated)
    }

    await this.invokeContract(
      'complete_settlement',
      [scvU64(householdId), scvU64(settlementId), scvAddress(payer), scvString(txHash)],
      payer,
    )
    const settlements = await this.getSettlements(householdId)
    return settlements.find(s => s.id === settlementId) ?? settlements[settlements.length - 1]
  }

  async failSettlement(
    householdId: number,
    settlementId: number,
    payer: string,
  ): Promise<Settlement> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      const current = state.settlements.find(
        s => s.id === settlementId && s.householdId === householdId,
      )
      if (!current) throw new Error('Settlement not found')
      if (current.payer !== payer) throw new Error('Only the payer can fail this settlement')
      if (current.status === 'completed') throw new Error('Settlement is already completed')
      if (current.status === 'failed') throw new Error('Settlement has already failed')
      const updated: Settlement = { ...structuredClone(current), status: 'failed' }
      await mockServerApi.updateState({
        settlements: state.settlements.map(s => (s.id === settlementId ? updated : s)),
      })
      return structuredClone(updated)
    }

    await this.invokeContract(
      'fail_settlement',
      [scvU64(householdId), scvU64(settlementId), scvAddress(payer)],
      payer,
    )
    const settlements = await this.getSettlements(householdId)
    return settlements.find(s => s.id === settlementId) ?? settlements[settlements.length - 1]
  }

  async getSettlements(householdId: number): Promise<Settlement[]> {
    if (this.isMock) {
      await mockDelay()
      const state = await mockServerApi.getState()
      return structuredClone(state.settlements.filter(s => s.householdId === householdId))
    }
    return decodeSettlements(
      await this.queryContract('get_settlements', [scvU64(householdId)]),
    )
  }

  // ─── Period close ─────────────────────────────────────────────────────────────

  async closePeriod(
    householdId: number,
    caller: string,
    periodLabel: string,
  ): Promise<Household> {
    if (this.isMock) {
      await mockDelay()
      const current = (await mockServerApi.getState()).household
      if (!current) throw new Error('No household loaded')
      const household: Household = {
        ...structuredClone(current),
        periodClosed: true,
        periodLabel,
      }
      await mockServerApi.updateState({ household })
      return structuredClone(household)
    }

    await this.invokeContract(
      'close_period',
      [scvU64(householdId), scvAddress(caller), scvString(periodLabel)],
      caller,
    )
    return this.fetchHousehold(householdId)
  }
}

export const contractService = new ContractService()