/**
 * Contract event reader.
 *
 * Reads recent Soroban contract events (from the BillBuddy contract) via
 * Soroban RPC `getEvents`. Events are emitted on-chain by the contract for
 * every important operation — BillCreated, MemberAdded, SettlementCompleted,
 * SettlementCreated, etc. — so both wallets see real activity without one
 * wallet having to push state to the other.
 */

import { config } from '@/config/env'
import { scValToNative } from '@stellar/stellar-sdk'
import type { ActivityItem, ActivityType } from '@/types'

/**
 * Which ledgers to scan on each poll. Events are indexed the same way
 * transactions are; scanning the last ~2 minutes keeps the feed live without
 * hammering the RPC.
 */
const LEDGER_WINDOW = 120
const EVENT_LIMIT = 25

export interface RawEvent {
  id: string
  type: ActivityType
  ledger: number
  householdId: number
  topic: string[]
  data: unknown
}

function eventNameOf(topicScv: unknown): string {
  const value = scValToNative(topicScv as never)
  return String(value ?? '')
}

export async function fetchContractEvents(): Promise<RawEvent[]> {
  const contractId = config.contracts.billbuddyContractId
  if (!contractId || config.flags.mockMode) return []

  const sdk = await import('@stellar/stellar-sdk')
  const server = new sdk.rpc.Server(config.stellar.sorobanRpcUrl)

  let latest: number
  try {
    const ledger = await server.getLatestLedger()
    latest = ledger.sequence
  } catch {
    // RPC unavailable (offline) — no activity
    return []
  }

  const startLedger = Math.max(1, latest - LEDGER_WINDOW)

  let result: { events: unknown[] } | null = null
  try {
    result = await server.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [contractId] }],
      limit: EVENT_LIMIT,
    })
  } catch {
    return []
  }

  const events = result?.events ?? []
  const out: RawEvent[] = []

  for (const raw of events as Array<{
    id?: string
    ledger?: number
    topic?: unknown[]
    value?: unknown
  }>) {
    const topic = raw.topic ?? []
    if (topic.length === 0) continue
    const name = eventNameOf(topic[0])
    const type = mapEventName(name)
    if (!type) continue

    const householdId = topic.length > 1 ? Number(scValToNative(topic[1] as never) ?? -1) : -1
    const topicRest = topic.slice(1).map(t => String(scValToNative(t as never) ?? ''))

    out.push({
      id: String(raw.id ?? `${raw.ledger ?? 0}-${out.length}`),
      type,
      ledger: Number(raw.ledger ?? 0),
      householdId,
      topic: topicRest,
      data: scValToNative(raw.value as never),
    })
  }

  return out
}

function mapEventName(name: string): ActivityType | null {
  switch (name) {
    case 'HouseholdCreated': return 'household_created'
    case 'MemberAdded': return 'member_added'
    case 'MemberRemoved': return 'member_removed'
    case 'PeriodClosed': return 'period_closed'
    case 'BillCreated': return 'bill_created'
    case 'BillUpdated': return 'bill_updated'
    case 'BillPaid': return 'bill_paid'
    case 'SettlementCreated': return 'settlement_created'
    case 'SettlementCompleted': return 'settlement_completed'
    case 'SettlementFailed': return 'settlement_failed'
    default: return null
  }
}

/**
 * Turn raw events into human-readable activity items, resolving addresses to
 * member display names when possible.
 *
 * topic here is the event topic with the leading event-name symbol removed:
 *   HouseholdCreated   (hh_id, owner)                 data = name
 *   MemberAdded        (hh_id, member)                data = display_name
 *   MemberRemoved      (hh_id, member)                data = ()
 *   BillCreated        (hh_id, bill_id, creator)      data = amount
 *   BillUpdated        (hh_id, bill_id)               data = ()
 *   SettlementCreated  (hh_id, sid, payer)            data = (receiver, amount)
 *   SettlementCompleted(hh_id, sid, payer)            data = tx_hash
 *   SettlementFailed   (hh_id, sid)                   data = ()
 *   PeriodClosed       (hh_id)                        data = period_label
 */
export function describeEvents(
  events: RawEvent[],
  members: Array<{ address: string; displayName: string }>,
): ActivityItem[] {
  const name = (address: string): string =>
    members.find(m => m.address === address)?.displayName ?? shorten(address)

  return events.map(e => {
    const topic = e.topic
    const dataArr = Array.isArray(e.data) ? e.data : null
    const amount = typeof e.data === 'number' ? e.data : (dataArr?.[1] as number | undefined)
    let description = 'Activity on the household'

    switch (e.type) {
      case 'household_created':
        description = `${name(topic[1])} created the household`
        break
      case 'member_added':
        description = `${name(topic[1])} was added to the household`
        break
      case 'member_removed':
        description = `${name(topic[1])} was removed from the household`
        break
      case 'bill_created':
        description = `${name(topic[2])} created a bill${amount !== undefined ? ` · ${formatAmt(amount)}` : ''}`
        break
      case 'bill_updated':
        description = 'A bill was updated'
        break
      case 'bill_paid':
        description = `${name(topic[2])} paid ${formatAmt(amount)} for a bill`
        break
      case 'settlement_created':
        description = `Payment of ${formatAmt(amount)} from ${name(topic[2])} was started`
        break
      case 'settlement_completed':
        description = `${name(topic[2])} paid · transaction confirmed`
        break
      case 'settlement_failed':
        description = 'A settlement attempt failed'
        break
      case 'period_closed':
        description = 'The monthly period was closed'
        break
    }

    return {
      id: e.id,
      type: e.type,
      ledger: e.ledger,
      at: Date.now(),
      householdId: e.householdId,
      description,
    }
  })
}

function formatAmt(cents?: number): string {
  if (cents === undefined) return ''
  const str = `${(cents / 100).toFixed(2)}`
  return `$ ${str}`
}

function shorten(address: string): string {
  if (!address || address.length <= 10) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}