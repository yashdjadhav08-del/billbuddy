use soroban_sdk::{Address, Env, String, Symbol};

// ─── Household events ─────────────────────────────────────────────────────────

pub fn household_created(env: &Env, household_id: u64, owner: &Address, name: &String) {
    let topics = (
        Symbol::new(env, "HouseholdCreated"),
        household_id,
        owner.clone(),
    );
    env.events().publish(topics, name.clone());
}

pub fn member_added(env: &Env, household_id: u64, member: &Address, display_name: &String) {
    let topics = (
        Symbol::new(env, "MemberAdded"),
        household_id,
        member.clone(),
    );
    env.events().publish(topics, display_name.clone());
}

pub fn member_removed(env: &Env, household_id: u64, member: &Address) {
    let topics = (
        Symbol::new(env, "MemberRemoved"),
        household_id,
        member.clone(),
    );
    env.events().publish(topics, ());
}

pub fn period_closed(env: &Env, household_id: u64, period_label: &String) {
    let topics = (Symbol::new(env, "PeriodClosed"), household_id);
    env.events().publish(topics, period_label.clone());
}

// ─── Bill events ──────────────────────────────────────────────────────────────

pub fn bill_created(env: &Env, household_id: u64, bill_id: u64, creator: &Address, amount: i128) {
    let topics = (
        Symbol::new(env, "BillCreated"),
        household_id,
        bill_id,
        creator.clone(),
    );
    env.events().publish(topics, amount);
}

pub fn bill_updated(env: &Env, household_id: u64, bill_id: u64) {
    let topics = (Symbol::new(env, "BillUpdated"), household_id, bill_id);
    env.events().publish(topics, ());
}

pub fn bill_deleted(env: &Env, household_id: u64, bill_id: u64, deleter: &Address) {
    let topics = (
        Symbol::new(env, "BillDeleted"),
        household_id,
        bill_id,
        deleter.clone(),
    );
    env.events().publish(topics, ());
}

pub fn bill_paid(env: &Env, household_id: u64, bill_id: u64, payer: &Address, amount: i128) {
    let topics = (
        Symbol::new(env, "BillPaid"),
        household_id,
        bill_id,
        payer.clone(),
    );
    env.events().publish(topics, amount);
}

pub fn bill_settled(env: &Env, household_id: u64, bill_id: u64) {
    let topics = (Symbol::new(env, "BillSettled"), household_id, bill_id);
    env.events().publish(topics, ());
}

// ─── Settlement events ────────────────────────────────────────────────────────

pub fn settlement_created(
    env: &Env,
    household_id: u64,
    settlement_id: u64,
    payer: &Address,
    receiver: &Address,
    amount: i128,
) {
    let topics = (
        Symbol::new(env, "SettlementCreated"),
        household_id,
        settlement_id,
        payer.clone(),
    );
    env.events().publish(topics, (receiver.clone(), amount));
}

pub fn settlement_completed(
    env: &Env,
    household_id: u64,
    settlement_id: u64,
    payer: &Address,
    tx_hash: &String,
) {
    let topics = (
        Symbol::new(env, "SettlementCompleted"),
        household_id,
        settlement_id,
        payer.clone(),
    );
    env.events().publish(topics, tx_hash.clone());
}

pub fn settlement_failed(env: &Env, household_id: u64, settlement_id: u64) {
    let topics = (
        Symbol::new(env, "SettlementFailed"),
        household_id,
        settlement_id,
    );
    env.events().publish(topics, ());
}

/// Emitted after an on-chain (inter-contract) token transfer settles a payment.
/// `token_contract` is the SAC / token contract that moved the funds.
pub fn settlement_transferred(
    env: &Env,
    household_id: u64,
    settlement_id: u64,
    payer: &Address,
    receiver: &Address,
    amount: i128,
    token_contract: &Address,
) {
    let topics = (
        Symbol::new(env, "SettlementTransferred"),
        household_id,
        settlement_id,
        payer.clone(),
        receiver.clone(),
    );
    env.events()
        .publish((topics,), (amount, token_contract.clone()));
}
