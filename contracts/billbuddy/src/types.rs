use soroban_sdk::{contracttype, Address, String, Vec};

// ─── Enums ───────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SplitType {
    Equal,
    CustomAmount,
    Percentage,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BillCategory {
    Rent,
    Electricity,
    Water,
    Internet,
    Groceries,
    Streaming,
    Maintenance,
    Custom,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BillStatus {
    Active,
    Settled,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SettlementStatus {
    Pending,
    Submitted,
    Completed,
    Failed,
}

// ─── Data structures ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Member {
    pub address: Address,
    pub display_name: String,
    pub joined_at: u64,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MemberShare {
    pub member: Address,
    /// Amount in minor units (e.g. cents). For percentage splits this is
    /// the resolved absolute share, not the percentage.
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MemberContribution {
    pub member: Address,
    /// How much the member actually paid toward this bill (minor units).
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Bill {
    pub id: u64,
    pub household_id: u64,
    pub title: String,
    pub category: BillCategory,
    /// Total amount in minor units (integer cents).
    pub total_amount: i128,
    pub creator: Address,
    pub created_at: u64,
    pub due_date: u64,
    pub split_type: SplitType,
    pub shares: Vec<MemberShare>,
    pub contributions: Vec<MemberContribution>,
    pub status: BillStatus,
}

/// A lightweight reference to a bill, used for the member → bills index
/// (shared-state discovery: any wallet address selected as a participant can
/// find every bill it belongs to, across households).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BillKey {
    pub household_id: u64,
    pub bill_id: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Household {
    pub id: u64,
    pub name: String,
    pub owner: Address,
    pub created_at: u64,
    pub active: bool,
    pub period_closed: bool,
    pub period_label: String,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Settlement {
    pub id: u64,
    pub household_id: u64,
    pub payer: Address,
    pub receiver: Address,
    /// Amount in minor units.
    pub amount: i128,
    pub asset: String,
    pub status: SettlementStatus,
    pub created_at: u64,
    pub transaction_hash: String,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MemberBalance {
    pub member: Address,
    /// net_balance = total_paid - total_owed
    /// Positive → should receive; Negative → owes.
    pub net_balance: i128,
}
