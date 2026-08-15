use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::*;
use soroban_sdk::{Address, Env, String, Vec};

/// Validate that shares sum exactly to total_amount and all amounts are positive.
fn validate_shares(total_amount: i128, shares: &Vec<MemberShare>) -> Result<(), ContractError> {
    if total_amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }
    if shares.is_empty() {
        return Err(ContractError::InvalidSplit);
    }

    let mut sum: i128 = 0;
    for i in 0..shares.len() {
        let s = shares.get(i).unwrap();
        if s.amount < 0 {
            return Err(ContractError::InvalidSplit);
        }
        sum = sum
            .checked_add(s.amount)
            .ok_or(ContractError::InternalError)?;
    }

    if sum != total_amount {
        return Err(ContractError::SplitMismatch);
    }
    Ok(())
}

/// Validate that contributions sum does not exceed total_amount and all amounts ≥ 0.
fn validate_contributions(
    total_amount: i128,
    contributions: &Vec<MemberContribution>,
) -> Result<(), ContractError> {
    let mut sum: i128 = 0;
    for i in 0..contributions.len() {
        let c = contributions.get(i).unwrap();
        if c.amount < 0 {
            return Err(ContractError::InvalidAmount);
        }
        sum = sum
            .checked_add(c.amount)
            .ok_or(ContractError::InternalError)?;
    }
    if sum > total_amount {
        return Err(ContractError::InvalidAmount);
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn create_bill(
    env: &Env,
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
    let household = storage::get_household(env, household_id)?;

    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    // Creator must be a member
    if !storage::is_member(env, household_id, &creator) {
        return Err(ContractError::UnauthorizedMutation);
    }

    validate_shares(total_amount, &shares)?;
    validate_contributions(total_amount, &contributions)?;

    // Participants are identified purely by the wallet address selected by the
    // creator — they do NOT have to be household members. This mirrors the
    // crowdfunding "create once → shared state → selected wallets can discover"
    // pattern: the bill becomes discoverable by every participant address.

    let bill_id = storage::next_bill_id(env);

    let bill = Bill {
        id: bill_id,
        household_id,
        title,
        category,
        total_amount,
        creator: creator.clone(),
        created_at: env.ledger().timestamp(),
        due_date,
        split_type,
        shares,
        contributions,
        status: BillStatus::Active,
    };

    storage::save_bill(env, &bill);
    index_participants(env, &bill);
    events::bill_created(env, household_id, bill_id, &creator, total_amount);
    Ok(bill_id)
}

/// Add every participant (share member + creator) to the member → bills index
/// so the bill can be discovered from shared state by the selected wallet
/// addresses.
fn index_participants(env: &Env, bill: &Bill) {
    for i in 0..bill.shares.len() {
        let s = bill.shares.get(i).unwrap();
        storage::add_member_bill(env, &s.member, bill.household_id, bill.id);
    }
    storage::add_member_bill(env, &bill.creator, bill.household_id, bill.id);
}

#[allow(clippy::too_many_arguments)]
pub fn update_bill(
    env: &Env,
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
    let household = storage::get_household(env, household_id)?;
    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    let bill = storage::get_bill(env, household_id, bill_id)?;

    // Only creator or household owner can update
    if bill.creator != caller && household.owner != caller {
        return Err(ContractError::UnauthorizedBillMutation);
    }

    if bill.status == BillStatus::Settled {
        return Err(ContractError::BillAlreadySettled);
    }

    validate_shares(total_amount, &shares)?;
    validate_contributions(total_amount, &contributions)?;

    let updated = Bill {
        title,
        category,
        total_amount,
        due_date,
        split_type,
        shares,
        contributions,
        ..bill
    };

    storage::save_bill(env, &updated);
    index_participants(env, &updated);
    events::bill_updated(env, household_id, bill_id);
    Ok(())
}

/// Delete a bill from shared state. Only the bill creator or the household
/// owner may delete, and settled bills are locked (deleting them would break
/// the balance invariant). Removes the bill and its member → bills index
/// entries so it stops appearing for every selected wallet.
pub fn delete_bill(
    env: &Env,
    household_id: u64,
    bill_id: u64,
    caller: Address,
) -> Result<(), ContractError> {
    let household = storage::get_household(env, household_id)?;
    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    let bill = storage::get_bill(env, household_id, bill_id)?;

    if bill.creator != caller && household.owner != caller {
        return Err(ContractError::UnauthorizedBillMutation);
    }

    if bill.status == BillStatus::Settled {
        return Err(ContractError::CannotDeleteSettledBill);
    }

    storage::remove_bill(env, household_id, bill_id)?;
    events::bill_deleted(env, household_id, bill_id, &caller);
    Ok(())
}

// ─── Per-bill payment ─────────────────────────────────────────────────────────
//
// `pay_bill` records a real, wallet-signed Soroban transaction that credits a
// participant's payment toward a specific bill. The payment moves "net" money
// from the payer to the member(s) who fronted the bill: we increase the payer's
// contribution and reduce the contributions of members whose contribution
// exceeds their share (the funders), leaving the contribution total unchanged.
// Because balances are computed as `contribution - share`, this keeps money
// conserved on-chain while flipping the payer's bill status to paid and the
// funders' receivable balances down.

fn contribution_of(bill: &Bill, member: &Address) -> i128 {
    for i in 0..bill.contributions.len() {
        let c = bill.contributions.get(i).unwrap();
        if c.member == *member {
            return c.amount;
        }
    }
    0
}

fn upsert_contribution(bill: &mut Bill, member: &Address, amount: i128) {
    for i in 0..bill.contributions.len() {
        if bill.contributions.get(i).unwrap().member == *member {
            let updated = MemberContribution {
                member: member.clone(),
                amount,
            };
            bill.contributions.set(i, updated);
            return;
        }
    }
    bill.contributions.push_back(MemberContribution {
        member: member.clone(),
        amount,
    });
}

pub fn pay_bill(
    env: &Env,
    household_id: u64,
    bill_id: u64,
    payer: Address,
    amount: i128,
) -> Result<(), ContractError> {
    let household = storage::get_household(env, household_id)?;
    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    let mut bill = storage::get_bill(env, household_id, bill_id)?;
    if bill.status == BillStatus::Settled {
        return Err(ContractError::BillAlreadySettled);
    }
    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    // Payer must be one of the participants selected for this bill.
    let mut payer_share: i128 = 0;
    let mut is_participant = false;
    for i in 0..bill.shares.len() {
        let s = bill.shares.get(i).unwrap();
        if s.member == payer {
            payer_share = s.amount;
            is_participant = true;
            break;
        }
    }
    if !is_participant {
        return Err(ContractError::NotBillParticipant);
    }

    let current = contribution_of(&bill, &payer);
    let outstanding = payer_share - current;
    if outstanding <= 0 {
        return Err(ContractError::AlreadyPaidShare);
    }
    if amount > outstanding {
        return Err(ContractError::BillPaymentTooLarge);
    }

    // Available surplus = how much the funders have fronted beyond their share.
    let mut surplus: i128 = 0;
    for i in 0..bill.shares.len() {
        let s = bill.shares.get(i).unwrap();
        let c = contribution_of(&bill, &s.member);
        if c > s.amount {
            surplus = surplus
                .checked_add(c - s.amount)
                .ok_or(ContractError::InternalError)?;
        }
    }
    if surplus < amount {
        return Err(ContractError::BillPaymentTooLarge);
    }

    // Credit the payer (their outstanding goes down).
    upsert_contribution(&mut bill, &payer, current + amount);

    // Recredit the funders (their receivable balance goes down) until the
    // payment is fully absorbed.
    let mut remaining = amount;
    for i in 0..bill.shares.len() {
        if remaining == 0 {
            break;
        }
        let s = bill.shares.get(i).unwrap();
        let c = contribution_of(&bill, &s.member);
        if c <= s.amount {
            continue;
        }
        let take = if c - s.amount < remaining {
            c - s.amount
        } else {
            remaining
        };
        upsert_contribution(&mut bill, &s.member, c - take);
        remaining -= take;
    }

    // A bill is settled once every participant has covered their share.
    let fully_paid = (0..bill.shares.len()).all(|i| {
        let s = bill.shares.get(i).unwrap();
        contribution_of(&bill, &s.member) >= s.amount
    });
    if fully_paid {
        bill.status = BillStatus::Settled;
    }

    storage::save_bill(env, &bill);
    events::bill_paid(env, household_id, bill_id, &payer, amount);
    if fully_paid {
        events::bill_settled(env, household_id, bill_id);
    }
    Ok(())
}
