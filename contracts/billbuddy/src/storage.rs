use crate::errors::ContractError;
use crate::types::*;
use soroban_sdk::{Address, Env, Vec};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const HOUSEHOLD_COUNT_KEY: &str = "hh_count";
const BILL_COUNT_KEY: &str = "bill_count";
const SETTLEMENT_COUNT_KEY: &str = "settle_count";

// ─── Counter helpers ──────────────────────────────────────────────────────────

pub fn next_household_id(env: &Env) -> u64 {
    let count: u64 = env
        .storage()
        .persistent()
        .get(&soroban_sdk::Symbol::new(env, HOUSEHOLD_COUNT_KEY))
        .unwrap_or(0u64);
    let next = count + 1;
    env.storage()
        .persistent()
        .set(&soroban_sdk::Symbol::new(env, HOUSEHOLD_COUNT_KEY), &next);
    next
}

pub fn next_bill_id(env: &Env) -> u64 {
    let count: u64 = env
        .storage()
        .persistent()
        .get(&soroban_sdk::Symbol::new(env, BILL_COUNT_KEY))
        .unwrap_or(0u64);
    let next = count + 1;
    env.storage()
        .persistent()
        .set(&soroban_sdk::Symbol::new(env, BILL_COUNT_KEY), &next);
    next
}

pub fn next_settlement_id(env: &Env) -> u64 {
    let count: u64 = env
        .storage()
        .persistent()
        .get(&soroban_sdk::Symbol::new(env, SETTLEMENT_COUNT_KEY))
        .unwrap_or(0u64);
    let next = count + 1;
    env.storage()
        .persistent()
        .set(&soroban_sdk::Symbol::new(env, SETTLEMENT_COUNT_KEY), &next);
    next
}

// ─── Composite key helpers ────────────────────────────────────────────────────

use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone)]
enum StorageKey {
    Household(u64),
    Members(u64),
    Bill(u64, u64),
    Bills(u64),
    Settlement(u64, u64),
    Settlements(u64),
    /// Reversed index from participant wallet address → bills they are part of.
    MemberBills(Address),
}

// ─── Household storage ────────────────────────────────────────────────────────

pub fn save_household(env: &Env, household: &Household) {
    env.storage()
        .persistent()
        .set(&StorageKey::Household(household.id), household);
}

pub fn get_household(env: &Env, id: u64) -> Result<Household, ContractError> {
    env.storage()
        .persistent()
        .get(&StorageKey::Household(id))
        .ok_or(ContractError::HouseholdNotFound)
}

// ─── Member storage ───────────────────────────────────────────────────────────

pub fn save_members(env: &Env, household_id: u64, members: &Vec<Member>) {
    env.storage()
        .persistent()
        .set(&StorageKey::Members(household_id), members);
}

pub fn get_members(env: &Env, household_id: u64) -> Result<Vec<Member>, ContractError> {
    // Verify the household exists first
    get_household(env, household_id)?;
    Ok(env
        .storage()
        .persistent()
        .get(&StorageKey::Members(household_id))
        .unwrap_or_else(|| Vec::new(env)))
}

// ─── Bill storage ─────────────────────────────────────────────────────────────

pub fn save_bill(env: &Env, bill: &Bill) {
    // Store individual bill
    env.storage()
        .persistent()
        .set(&StorageKey::Bill(bill.household_id, bill.id), bill);

    // Update bill ID list for the household
    let mut bill_ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&StorageKey::Bills(bill.household_id))
        .unwrap_or_else(|| Vec::new(env));

    // Only add if not already present
    let mut found = false;
    for i in 0..bill_ids.len() {
        if bill_ids.get(i).unwrap() == bill.id {
            found = true;
            break;
        }
    }
    if !found {
        bill_ids.push_back(bill.id);
        env.storage()
            .persistent()
            .set(&StorageKey::Bills(bill.household_id), &bill_ids);
    }
}

pub fn get_bill(env: &Env, household_id: u64, bill_id: u64) -> Result<Bill, ContractError> {
    env.storage()
        .persistent()
        .get(&StorageKey::Bill(household_id, bill_id))
        .ok_or(ContractError::BillNotFound)
}

pub fn get_bills(env: &Env, household_id: u64) -> Result<Vec<Bill>, ContractError> {
    get_household(env, household_id)?;
    let bill_ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&StorageKey::Bills(household_id))
        .unwrap_or_else(|| Vec::new(env));

    let mut bills = Vec::new(env);
    for i in 0..bill_ids.len() {
        let id = bill_ids.get(i).unwrap();
        if let Ok(bill) = get_bill(env, household_id, id) {
            bills.push_back(bill);
        }
    }
    Ok(bills)
}

// ─── Member → bills index (shared-state discovery) ──────────────────────────

/// Record that `member` is a participant of the given bill. Used so any wallet
/// address selected for a bill can later discover it directly from shared state,
/// without needing to know which household it belongs to.
pub fn add_member_bill(env: &Env, member: &Address, household_id: u64, bill_id: u64) {
    let mut refs: Vec<BillKey> = env
        .storage()
        .persistent()
        .get(&StorageKey::MemberBills(member.clone()))
        .unwrap_or_else(|| Vec::new(env));

    let mut found = false;
    for i in 0..refs.len() {
        let r = refs.get(i).unwrap();
        if r.household_id == household_id && r.bill_id == bill_id {
            found = true;
            break;
        }
    }
    if !found {
        refs.push_back(BillKey {
            household_id,
            bill_id,
        });
        env.storage()
            .persistent()
            .set(&StorageKey::MemberBills(member.clone()), &refs);
    }
}

/// Return every bill (across all households) where `member` is a participant.
/// This is the "shared state → discoverable by selected wallet address" read.
pub fn get_member_bills(env: &Env, member: &Address) -> Result<Vec<Bill>, ContractError> {
    let refs: Vec<BillKey> = env
        .storage()
        .persistent()
        .get(&StorageKey::MemberBills(member.clone()))
        .unwrap_or_else(|| Vec::new(env));

    let mut bills = Vec::new(env);
    for i in 0..refs.len() {
        let r = refs.get(i).unwrap();
        if let Ok(bill) = get_bill(env, r.household_id, r.bill_id) {
            bills.push_back(bill);
        }
    }
    Ok(bills)
}

/// Drop a single `BillKey` reference from a participant's member → bills index.
pub fn remove_member_bill(env: &Env, member: &Address, household_id: u64, bill_id: u64) {
    let refs: Vec<BillKey> = env
        .storage()
        .persistent()
        .get(&StorageKey::MemberBills(member.clone()))
        .unwrap_or_else(|| Vec::new(env));

    let mut keep = Vec::new(env);
    for i in 0..refs.len() {
        let r = refs.get(i).unwrap();
        if r.household_id != household_id || r.bill_id != bill_id {
            keep.push_back(r);
        }
    }
    env.storage()
        .persistent()
        .set(&StorageKey::MemberBills(member.clone()), &keep);
}

/// Permanently remove a bill from shared state: the bill record itself, its
/// household bill list, and every participant's member → bills index entry.
pub fn remove_bill(env: &Env, household_id: u64, bill_id: u64) -> Result<(), ContractError> {
    let bill = get_bill(env, household_id, bill_id)?;

    env.storage()
        .persistent()
        .remove(&StorageKey::Bill(household_id, bill_id));

    // Drop from the household bill-id list.
    let bill_ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&StorageKey::Bills(household_id))
        .unwrap_or_else(|| Vec::new(env));
    let mut keep_ids = Vec::new(env);
    for i in 0..bill_ids.len() {
        let id = bill_ids.get(i).unwrap();
        if id != bill_id {
            keep_ids.push_back(id);
        }
    }
    env.storage()
        .persistent()
        .set(&StorageKey::Bills(household_id), &keep_ids);

    // Drop from the member → bills index for every participant (shares,
    // contributions and creator) so deleted bills stop appearing for selected
    // wallets that are not household members.
    for i in 0..bill.shares.len() {
        let s = bill.shares.get(i).unwrap();
        remove_member_bill(env, &s.member, household_id, bill_id);
    }
    for i in 0..bill.contributions.len() {
        let c = bill.contributions.get(i).unwrap();
        remove_member_bill(env, &c.member, household_id, bill_id);
    }
    remove_member_bill(env, &bill.creator, household_id, bill_id);

    Ok(())
}

// ─── Settlement storage ───────────────────────────────────────────────────────

pub fn save_settlement(env: &Env, settlement: &Settlement) {
    env.storage().persistent().set(
        &StorageKey::Settlement(settlement.household_id, settlement.id),
        settlement,
    );

    let mut ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&StorageKey::Settlements(settlement.household_id))
        .unwrap_or_else(|| Vec::new(env));

    let mut found = false;
    for i in 0..ids.len() {
        if ids.get(i).unwrap() == settlement.id {
            found = true;
            break;
        }
    }
    if !found {
        ids.push_back(settlement.id);
        env.storage()
            .persistent()
            .set(&StorageKey::Settlements(settlement.household_id), &ids);
    }
}

pub fn get_settlement(
    env: &Env,
    household_id: u64,
    settlement_id: u64,
) -> Result<Settlement, ContractError> {
    env.storage()
        .persistent()
        .get(&StorageKey::Settlement(household_id, settlement_id))
        .ok_or(ContractError::SettlementNotFound)
}

pub fn get_settlements(env: &Env, household_id: u64) -> Result<Vec<Settlement>, ContractError> {
    get_household(env, household_id)?;
    let ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&StorageKey::Settlements(household_id))
        .unwrap_or_else(|| Vec::new(env));

    let mut settlements = Vec::new(env);
    for i in 0..ids.len() {
        let id = ids.get(i).unwrap();
        if let Ok(s) = get_settlement(env, household_id, id) {
            settlements.push_back(s);
        }
    }
    Ok(settlements)
}

// ─── Member lookup helper ─────────────────────────────────────────────────────

pub fn find_member(
    env: &Env,
    household_id: u64,
    address: &Address,
) -> Result<Member, ContractError> {
    let members = get_members(env, household_id)?;
    for i in 0..members.len() {
        let m = members.get(i).unwrap();
        if m.address == *address {
            return Ok(m);
        }
    }
    Err(ContractError::MemberNotFound)
}

pub fn is_member(env: &Env, household_id: u64, address: &Address) -> bool {
    find_member(env, household_id, address).is_ok()
}
