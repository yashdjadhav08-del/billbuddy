#![no_std]

mod balances;
mod bills;
mod errors;
mod events;
mod household;
mod settlement;
mod storage;
mod types;

pub use errors::ContractError;
pub use types::*;

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

#[contract]
pub struct BillBuddyContract;

#[contractimpl]
impl BillBuddyContract {
    // ─── Household ───────────────────────────────────────────────────────────

    /// Create a new household. The caller becomes the owner.
    pub fn create_household(env: Env, name: String, owner: Address) -> Result<u64, ContractError> {
        owner.require_auth();
        household::create_household(&env, name, owner)
    }

    /// Get household info by ID.
    pub fn get_household(env: Env, household_id: u64) -> Result<Household, ContractError> {
        storage::get_household(&env, household_id)
    }

    /// Add a member to a household. Only the owner can do this.
    pub fn add_member(
        env: Env,
        household_id: u64,
        caller: Address,
        member_address: Address,
        display_name: String,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        household::add_member(&env, household_id, caller, member_address, display_name)
    }

    /// Remove a member from a household. Only the owner can do this.
    pub fn remove_member(
        env: Env,
        household_id: u64,
        caller: Address,
        member_address: Address,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        household::remove_member(&env, household_id, caller, member_address)
    }

    /// Get all members of a household.
    pub fn get_members(env: Env, household_id: u64) -> Result<Vec<Member>, ContractError> {
        storage::get_members(&env, household_id)
    }

    // ─── Bills ───────────────────────────────────────────────────────────────

    /// Create a bill in a household.
    #[allow(clippy::too_many_arguments)]
    pub fn create_bill(
        env: Env,
        household_id: u64,
        creator: Address,
        title: String,
        category: BillCategory,
        total_amount: i128,
        due_date: u64,
        split_type: SplitType,
        shares: Vec<MemberShare>,
        contributions: Vec<MemberContribution>,
    ) -> Result<u64, ContractError> {
        creator.require_auth();
        bills::create_bill(
            &env,
            household_id,
            creator,
            title,
            category,
            total_amount,
            due_date,
            split_type,
            shares,
            contributions,
        )
    }

    /// Update a bill. Only the bill creator or household owner can update.
    #[allow(clippy::too_many_arguments)]
    pub fn update_bill(
        env: Env,
        household_id: u64,
        bill_id: u64,
        caller: Address,
        title: String,
        category: BillCategory,
        total_amount: i128,
        due_date: u64,
        split_type: SplitType,
        shares: Vec<MemberShare>,
        contributions: Vec<MemberContribution>,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        bills::update_bill(
            &env,
            household_id,
            bill_id,
            caller,
            title,
            category,
            total_amount,
            due_date,
            split_type,
            shares,
            contributions,
        )
    }

    /// Delete a bill from shared state. Only the bill creator or household
    /// owner can delete, and settled bills are locked. Removes the bill and its
    /// participant index entries so it stops appearing for every selected wallet.
    pub fn delete_bill(
        env: Env,
        household_id: u64,
        bill_id: u64,
        caller: Address,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        bills::delete_bill(&env, household_id, bill_id, caller)
    }

    /// Get a bill by ID.
    pub fn get_bill(env: Env, household_id: u64, bill_id: u64) -> Result<Bill, ContractError> {
        storage::get_bill(&env, household_id, bill_id)
    }

    /// Get all bills for a household.
    pub fn get_bills(env: Env, household_id: u64) -> Result<Vec<Bill>, ContractError> {
        storage::get_bills(&env, household_id)
    }

    /// Get every bill (across all households) where `member` is a participant.
    /// Enables shared-state discovery: once a wallet address is selected for a
    /// bill, that wallet can find the bill directly — no household join needed.
    pub fn get_member_bills(env: Env, member: Address) -> Result<Vec<Bill>, ContractError> {
        storage::get_member_bills(&env, &member)
    }

    /// Record a participant's payment toward a specific bill. Real, signed
    /// Soroban transaction: flips the payer's share to paid and updates the
    /// funders' receivable balances on-chain.
    pub fn pay_bill(
        env: Env,
        household_id: u64,
        bill_id: u64,
        payer: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        payer.require_auth();
        bills::pay_bill(&env, household_id, bill_id, payer, amount)
    }

    // ─── Balances ────────────────────────────────────────────────────────────

    /// Calculate the net balance for a member across all bills in a household.
    /// Positive = member should receive. Negative = member owes.
    pub fn get_balance(
        env: Env,
        household_id: u64,
        member: Address,
    ) -> Result<i128, ContractError> {
        balances::get_balance(&env, household_id, member)
    }

    /// Get all member balances for a household.
    pub fn get_all_balances(
        env: Env,
        household_id: u64,
    ) -> Result<Vec<MemberBalance>, ContractError> {
        balances::get_all_balances(&env, household_id)
    }

    // ─── Settlements ─────────────────────────────────────────────────────────

    /// Create a settlement record (payer → receiver).
    pub fn create_settlement(
        env: Env,
        household_id: u64,
        payer: Address,
        receiver: Address,
        amount: i128,
        asset: String,
    ) -> Result<u64, ContractError> {
        payer.require_auth();
        settlement::create_settlement(&env, household_id, payer, receiver, amount, asset)
    }

    /// Mark a settlement as completed with the transaction hash.
    /// Must be called by the payer.
    pub fn complete_settlement(
        env: Env,
        household_id: u64,
        settlement_id: u64,
        payer: Address,
        tx_hash: String,
    ) -> Result<(), ContractError> {
        payer.require_auth();
        settlement::complete_settlement(&env, household_id, settlement_id, payer, tx_hash)
    }

    /// Mark a settlement as failed.
    pub fn fail_settlement(
        env: Env,
        household_id: u64,
        settlement_id: u64,
        payer: Address,
    ) -> Result<(), ContractError> {
        payer.require_auth();
        settlement::fail_settlement(&env, household_id, settlement_id, payer)
    }

    /// Settle a payment on-chain by transferring tokens through the given
    /// token (Stellar Asset) contract. Inter-contract call: BillBuddy invokes
    /// `transfer` on the token contract, moving funds atomically with recording
    /// the settlement as completed.
    pub fn pay_settlement(
        env: Env,
        household_id: u64,
        settlement_id: u64,
        payer: Address,
        token_contract: Address,
    ) -> Result<(), ContractError> {
        payer.require_auth();
        settlement::pay_settlement(&env, household_id, settlement_id, payer, token_contract)
    }

    /// Read a member's balance from a token (Stellar Asset) contract.
    /// Read-only inter-contract call.
    pub fn get_token_balance(env: Env, account: Address, token_contract: Address) -> i128 {
        settlement::get_token_balance(&env, account, token_contract)
    }

    /// Get a settlement by ID.
    pub fn get_settlement(
        env: Env,
        household_id: u64,
        settlement_id: u64,
    ) -> Result<Settlement, ContractError> {
        storage::get_settlement(&env, household_id, settlement_id)
    }

    /// Get all settlements for a household.
    pub fn get_settlements(env: Env, household_id: u64) -> Result<Vec<Settlement>, ContractError> {
        storage::get_settlements(&env, household_id)
    }

    /// Close the monthly period. Fails if any member has a non-zero balance.
    pub fn close_period(
        env: Env,
        household_id: u64,
        caller: Address,
        period_label: String,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        household::close_period(&env, household_id, caller, period_label)
    }
}
