/**
 * Soroban ScVal codec for the BillBuddy contract.
 *
 * Encodes TypeScript domain values into contract ScVal arguments and decodes
 * contract ScVal results back into TypeScript types. This is the bridge between
 * the React app and the Soroban smart contract (contracts/billbuddy).
 *
 * Contract custom types (from `src/types.rs`):
 *   - Enums (unit variants) are encoded as `ScvVec([ScvSymbol(variant)])`
 *   - Structs are encoded as `ScvMap` with `ScvSymbol` field-name keys
 */

import { xdr, nativeToScVal, scValToNative } from '@stellar/stellar-sdk'
import type {
  Bill,
  BillCategory,
  BillStatus,
  Household,
  Member,
  MemberBalance,
  MemberContribution,
  MemberShare,
  Settlement,
  SettlementStatus,
  SplitType,
} from '@/types'

// ─── Primitive encoders ───────────────────────────────────────────────────────

export function scvSymbol(name: string): xdr.ScVal {
  return nativeToScVal(name, { type: 'symbol' }) as xdr.ScVal
}

export function scvString(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'string' }) as xdr.ScVal
}

export function scvU64(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u64' }) as xdr.ScVal
}

export function scvI128(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' }) as xdr.ScVal
}

export function scvBool(value: boolean): xdr.ScVal {
  return nativeToScVal(value) as xdr.ScVal
}

export function scvAddress(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'address' }) as xdr.ScVal
}

export function scvVec(items: xdr.ScVal[]): xdr.ScVal {
  return xdr.ScVal.scvVec(items)
}

/** Encode a unit-variant enum as `ScvVec([ScvSymbol(variant)])`. */
export function scvVariant(name: string): xdr.ScVal {
  return scvVec([scvSymbol(name)])
}

/** Encode a struct as an `ScvMap` with symbol keys, keys sorted
 *  lexicographically (Soroban requires map keys in sorted order). */
export function scvMap(entries: Array<[string, xdr.ScVal]>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    entries
      .slice()
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, val]) => new xdr.ScMapEntry({ key: scvSymbol(key), val }),
      ),
  )
}

// ─── Enum variants ────────────────────────────────────────────────────────────

const SPLIT_VARIANTS: Record<SplitType, string> = {
  equal: 'Equal',
  custom_amount: 'CustomAmount',
  percentage: 'Percentage',
}

const CATEGORY_VARIANTS: Record<BillCategory, string> = {
  rent: 'Rent',
  electricity: 'Electricity',
  water: 'Water',
  internet: 'Internet',
  groceries: 'Groceries',
  streaming: 'Streaming',
  maintenance: 'Maintenance',
  custom: 'Custom',
}

export function splitTypeVariant(splitType: SplitType): xdr.ScVal {
  return scvVariant(SPLIT_VARIANTS[splitType])
}

export function billCategoryVariant(category: BillCategory): xdr.ScVal {
  return scvVariant(CATEGORY_VARIANTS[category])
}

// ─── Struct encoders ──────────────────────────────────────────────────────────

export function memberShareScVal(share: MemberShare): xdr.ScVal {
  return scvMap([
    ['member', scvAddress(share.member)],
    ['amount', scvI128(share.amount)],
  ])
}

export function memberContributionScVal(c: MemberContribution): xdr.ScVal {
  return scvMap([
    ['member', scvAddress(c.member)],
    ['amount', scvI128(c.amount)],
  ])
}

// ─── Decoders ─────────────────────────────────────────────────────────────────

/** Coerce an i128/u64/i32 value (number or bigint) to a JS number. */
function toNumber(v: unknown): number {
  if (typeof v === 'bigint') return Number(v)
  return Number(v)
}

/** Contract enums decode to an array holding one symbol string, e.g. ["Equal"]. */
function variantName(v: unknown): string {
  if (Array.isArray(v) && v.length > 0) return String(v[0])
  return String(v)
}

function decodeSplitType(v: unknown): SplitType {
  const raw = variantName(v).toLowerCase()
  if (raw === 'customamount') return 'custom_amount'
  if (raw === 'equal' || raw === 'percentage') return raw as SplitType
  return 'custom_amount'
}

function decodeBillCategory(v: unknown): BillCategory {
  return variantName(v).toLowerCase() as BillCategory
}

function decodeBillStatus(v: unknown): BillStatus {
  return variantName(v).toLowerCase() === 'settled' ? 'settled' : 'active'
}

function decodeSettlementStatus(v: unknown): SettlementStatus {
  return variantName(v).toLowerCase() as SettlementStatus
}

interface RawMap {
  [key: string]: unknown
}

function rawOf(scVal: xdr.ScVal): RawMap {
  return scValToNative(scVal) as RawMap
}

function decodeMemberNative(r: RawMap): Member {
  return {
    address: String(r.address ?? ''),
    displayName: String(r.display_name ?? ''),
    joinedAt: toNumber(r.joined_at),
    active: Boolean(r.active),
  }
}

export function decodeMember(scVal: xdr.ScVal): Member {
  return decodeMemberNative(rawOf(scVal))
}

export function decodeMembers(scVal: xdr.ScVal): Member[] {
  const arr = scValToNative(scVal) as RawMap[]
  return arr.map(decodeMemberNative)
}

function decodeShare(r: RawMap): MemberShare {
  return { member: String(r.member ?? ''), amount: toNumber(r.amount) }
}

function decodeContribution(r: RawMap): MemberContribution {
  return { member: String(r.member ?? ''), amount: toNumber(r.amount) }
}

function decodeBillNative(r: RawMap): Bill {
  return {
    id: toNumber(r.id),
    householdId: toNumber(r.household_id),
    title: String(r.title ?? ''),
    category: decodeBillCategory(r.category),
    totalAmount: toNumber(r.total_amount),
    creator: String(r.creator ?? ''),
    createdAt: toNumber(r.created_at),
    dueDate: toNumber(r.due_date),
    splitType: decodeSplitType(r.split_type),
    shares: (r.shares as RawMap[]).map(decodeShare),
    contributions: (r.contributions as RawMap[]).map(decodeContribution),
    status: decodeBillStatus(r.status),
  }
}

export function decodeBill(scVal: xdr.ScVal): Bill {
  return decodeBillNative(rawOf(scVal))
}

export function decodeBills(scVal: xdr.ScVal): Bill[] {
  const arr = scValToNative(scVal) as RawMap[]
  return arr.map(decodeBillNative)
}

function decodeHouseholdNative(r: RawMap): Household {
  return {
    id: toNumber(r.id),
    name: String(r.name ?? ''),
    owner: String(r.owner ?? ''),
    createdAt: toNumber(r.created_at),
    active: Boolean(r.active),
    periodClosed: Boolean(r.period_closed),
    periodLabel: String(r.period_label ?? ''),
    members: [],
  }
}

export function decodeHousehold(scVal: xdr.ScVal): Household {
  return decodeHouseholdNative(rawOf(scVal))
}

function decodeSettlementNative(r: RawMap): Settlement {
  return {
    id: toNumber(r.id),
    householdId: toNumber(r.household_id),
    payer: String(r.payer ?? ''),
    receiver: String(r.receiver ?? ''),
    amount: toNumber(r.amount),
    asset: String(r.asset ?? 'XLM'),
    status: decodeSettlementStatus(r.status),
    createdAt: toNumber(r.created_at),
    transactionHash: String(r.transaction_hash ?? ''),
  }
}

export function decodeSettlement(scVal: xdr.ScVal): Settlement {
  return decodeSettlementNative(rawOf(scVal))
}

export function decodeSettlements(scVal: xdr.ScVal): Settlement[] {
  const arr = scValToNative(scVal) as RawMap[]
  return arr.map(decodeSettlementNative)
}

export function decodeMemberBalances(scVal: xdr.ScVal): MemberBalance[] {
  const arr = scValToNative(scVal) as RawMap[]
  return arr.map(r => ({
    member: String(r.member ?? ''),
    displayName: String(r.member ?? ''),
    netBalance: toNumber(r.net_balance),
  }))
}

/** Decode a plain u64/i128 into a JS number (return values of counters/balances). */
export function decodeNumber(scVal: xdr.ScVal): number {
  return toNumber(scValToNative(scVal))
}

/** Decode a Vec<u64> into a JS number array. */
export function decodeNumberArray(scVal: xdr.ScVal): number[] {
  const arr = scValToNative(scVal) as unknown[]
  return arr.map(toNumber)
}