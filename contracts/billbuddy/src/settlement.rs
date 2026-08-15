use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::*;
use soroban_sdk::{Address, Env, String};

pub fn create_settlement(
    env: &Env,
    household_id: u64,
    payer: Address,
    receiver: Address,
    amount: i128,
    asset: String,
) -> Result<u64, ContractError> {
    let household = storage::get_household(env, household_id)?;
    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    if amount <= 0 {
        return Err(ContractError::InvalidInput);
    }

    // Both must be members
    if !storage::is_member(env, household_id, &payer) {
        return Err(ContractError::MemberNotFound);
    }
    if !storage::is_member(env, household_id, &receiver) {
        return Err(ContractError::MemberNotFound);
    }

    // Check for duplicate pending settlement between same payer/receiver
    let existing = storage::get_settlements(env, household_id)?;
    for i in 0..existing.len() {
        let s = existing.get(i).unwrap();
        if s.payer == payer
            && s.receiver == receiver
            && s.amount == amount
            && s.status == SettlementStatus::Pending
        {
            return Err(ContractError::DuplicateSettlement);
        }
    }

    let id = storage::next_settlement_id(env);
    let settlement = Settlement {
        id,
        household_id,
        payer: payer.clone(),
        receiver: receiver.clone(),
        amount,
        asset,
        status: SettlementStatus::Pending,
        created_at: env.ledger().timestamp(),
        transaction_hash: String::from_str(env, ""),
    };

    storage::save_settlement(env, &settlement);
    events::settlement_created(env, household_id, id, &payer, &receiver, amount);
    Ok(id)
}

pub fn complete_settlement(
    env: &Env,
    household_id: u64,
    settlement_id: u64,
    payer: Address,
    tx_hash: String,
) -> Result<(), ContractError> {
    let mut settlement = storage::get_settlement(env, household_id, settlement_id)?;

    if settlement.payer != payer {
        return Err(ContractError::UnauthorizedSettlement);
    }

    match settlement.status {
        SettlementStatus::Completed => return Err(ContractError::SettlementAlreadyCompleted),
        SettlementStatus::Failed => return Err(ContractError::SettlementAlreadyFailed),
        _ => {}
    }

    settlement.status = SettlementStatus::Completed;
    settlement.transaction_hash = tx_hash.clone();
    storage::save_settlement(env, &settlement);

    events::settlement_completed(env, household_id, settlement_id, &payer, &tx_hash);
    Ok(())
}

pub fn fail_settlement(
    env: &Env,
    household_id: u64,
    settlement_id: u64,
    payer: Address,
) -> Result<(), ContractError> {
    let mut settlement = storage::get_settlement(env, household_id, settlement_id)?;

    if settlement.payer != payer {
        return Err(ContractError::UnauthorizedSettlement);
    }

    match settlement.status {
        SettlementStatus::Completed => return Err(ContractError::SettlementAlreadyCompleted),
        SettlementStatus::Failed => return Err(ContractError::SettlementAlreadyFailed),
        _ => {}
    }

    settlement.status = SettlementStatus::Failed;
    storage::save_settlement(env, &settlement);

    events::settlement_failed(env, household_id, settlement_id);
    Ok(())
}
