use crate::errors::ContractError;
use crate::storage;
use crate::types::*;
use soroban_sdk::{Address, Env, Vec};

/// Calculate the net balance for a single member across all active bills.
/// net_balance = total_contributed - total_owed (share)
/// Positive → should receive money. Negative → owes money.
pub fn get_balance(env: &Env, household_id: u64, member: Address) -> Result<i128, ContractError> {
    // Verify member exists
    storage::find_member(env, household_id, &member)?;

    let bills = storage::get_bills(env, household_id)?;
    let settlements = storage::get_settlements(env, household_id)?;

    let mut total_paid: i128 = 0;
    let mut total_owed: i128 = 0;

    for i in 0..bills.len() {
        let bill = bills.get(i).unwrap();
        // Skip settled bills (already accounted for)
        if bill.status == BillStatus::Settled {
            continue;
        }

        // Amount this member contributed
        for j in 0..bill.contributions.len() {
            let c = bill.contributions.get(j).unwrap();
            if c.member == member {
                total_paid = total_paid
                    .checked_add(c.amount)
                    .ok_or(ContractError::InternalError)?;
                break;
            }
        }

        // Amount this member is responsible for (their share)
        for j in 0..bill.shares.len() {
            let s = bill.shares.get(j).unwrap();
            if s.member == member {
                total_owed = total_owed
                    .checked_add(s.amount)
                    .ok_or(ContractError::InternalError)?;
                break;
            }
        }
    }

    // Adjust for completed settlements
    for i in 0..settlements.len() {
        let s = settlements.get(i).unwrap();
        if s.status != SettlementStatus::Completed {
            continue;
        }
        if s.payer == member {
            // Member paid, reduce what they owe
            total_paid = total_paid
                .checked_add(s.amount)
                .ok_or(ContractError::InternalError)?;
        }
        if s.receiver == member {
            // Member received, reduce what they are owed
            total_owed = total_owed
                .checked_add(s.amount)
                .ok_or(ContractError::InternalError)?;
        }
    }

    let net = total_paid
        .checked_sub(total_owed)
        .ok_or(ContractError::InternalError)?;

    Ok(net)
}

/// Get all member balances for a household.
pub fn get_all_balances(env: &Env, household_id: u64) -> Result<Vec<MemberBalance>, ContractError> {
    let members = storage::get_members(env, household_id)?;
    let mut balances: Vec<MemberBalance> = Vec::new(env);

    for i in 0..members.len() {
        let m = members.get(i).unwrap();
        if !m.active {
            continue;
        }
        let net_balance = get_balance(env, household_id, m.address.clone())?;
        balances.push_back(MemberBalance {
            member: m.address,
            net_balance,
        });
    }

    Ok(balances)
}
