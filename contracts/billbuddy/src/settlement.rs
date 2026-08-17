use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::*;
use soroban_sdk::token::TokenClient;
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

// ─── Inter-contract communication ────────────────────────────────────────────
//
// BillBuddy talks to a Stellar Asset Contract (SAC) / token contract on-chain.
// Instead of only *recording* that a payment happened (like the Classic
// payment path does), `pay_settlement` makes the token contract actually move
// funds between members within a single Soroban transaction.

/// Settle a pending settlement by transferring tokens on-chain through the
/// given token (Stellar Asset) contract. Inter-contract call: this contract
/// invokes `transfer(from, to, amount)` on the token contract, which
/// authenticates the payer and moves the funds atomically with this call.
pub fn pay_settlement(
    env: &Env,
    household_id: u64,
    settlement_id: u64,
    payer: Address,
    token_contract: Address,
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

    // Inter-contract call: move the funds via the token contract.
    // The token contract re-checks payer auth for (from, to, amount).
    let client = TokenClient::new(env, &token_contract);
    let result = client.try_transfer(&settlement.payer, &settlement.receiver, &settlement.amount);

    // try_* returns Result<Result<T, _>, Result<_, InvokeError>>.
    // Any Err layer means the token contract rejected the transfer.
    if result.is_err() || result.as_ref().unwrap().is_err() {
        return Err(ContractError::TokenTransferFailed);
    }

    settlement.status = SettlementStatus::Completed;
    settlement.transaction_hash = String::from_str(env, "");
    storage::save_settlement(env, &settlement);

    events::settlement_transferred(
        env,
        household_id,
        settlement_id,
        &settlement.payer,
        &settlement.receiver,
        settlement.amount,
        &token_contract,
    );
    Ok(())
}

/// Read-only inter-contract call: query a token (SAC) contract for an
/// account's balance. Demonstrates reading state from another contract.
pub fn get_token_balance(env: &Env, account: Address, token_contract: Address) -> i128 {
    let client = TokenClient::new(env, &token_contract);
    client.balance(&account)
}
