// ─── Domain Types ─────────────────────────────────────────────────────────────
// All monetary values are stored as integer minor units (cents).
// $32.50 → 3250

export type SplitType = 'equal' | 'custom_amount' | 'percentage'

export type BillCategory =
  | 'rent'
  | 'electricity'
  | 'water'
  | 'internet'
  | 'groceries'
  | 'streaming'
  | 'maintenance'
  | 'custom'

export type BillStatus = 'active' | 'settled'

export type SettlementStatus =
  | 'pending'
  | 'signing'
  | 'submitted'
  | 'confirming'
  | 'completed'
  | 'failed'

// ─── Household ────────────────────────────────────────────────────────────────

export interface Member {
  address: string
  displayName: string
  joinedAt: number
  active: boolean
}

export interface Household {
  id: number
  name: string
  owner: string
  createdAt: number
  active: boolean
  periodClosed: boolean
  periodLabel: string
  members: Member[]
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export interface MemberShare {
  member: string
  /** Integer minor units */
  amount: number
}

export interface MemberContribution {
  member: string
  /** Integer minor units */
  amount: number
}

export interface Bill {
  id: number
  householdId: number
  title: string
  category: BillCategory
  /** Integer minor units */
  totalAmount: number
  creator: string
  createdAt: number
  dueDate: number
  splitType: SplitType
  shares: MemberShare[]
  contributions: MemberContribution[]
  status: BillStatus
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export interface MemberBalance {
  member: string
  displayName: string
  /** Integer minor units. Positive = owed money. Negative = owes money. */
  netBalance: number
}

// ─── Settlements ──────────────────────────────────────────────────────────────

export interface Settlement {
  id: number
  householdId: number
  payer: string
  receiver: string
  /** Integer minor units */
  amount: number
  asset: string
  status: SettlementStatus
  createdAt: number
  transactionHash: string
}

/** A directed payment in the optimized settlement plan */
export interface SettlementTransfer {
  from: string
  fromName: string
  to: string
  toName: string
  /** Integer minor units */
  amount: number
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type NetworkType = 'testnet' | 'mainnet' | 'futurenet'

export interface WalletState {
  status: WalletStatus
  publicKey: string | null
  network: NetworkType | null
  error: string | null
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export type TxStatus =
  | 'idle'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error'

export interface TxState {
  status: TxStatus
  hash: string | null
  error: string | null
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
}

// ─── Activity / events ────────────────────────────────────────────────────────

export type ActivityType =
  | 'household_created'
  | 'member_added'
  | 'member_removed'
  | 'bill_created'
  | 'bill_updated'
  | 'bill_paid'
  | 'settlement_created'
  | 'settlement_completed'
  | 'settlement_failed'
  | 'period_closed'

export interface ActivityItem {
  id: string
  type: ActivityType
  /** Ledger sequence (used for chronological sorting across polls). */
  ledger: number
  /** Approximate timestamp. */
  at: number
  householdId: number
  description: string
}
