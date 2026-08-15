use crate::balances;
use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::*;
use soroban_sdk::{Address, Env, String, Vec};

pub fn create_household(env: &Env, name: String, owner: Address) -> Result<u64, ContractError> {
    let id = storage::next_household_id(env);

    let household = Household {
        id,
        name: name.clone(),
        owner: owner.clone(),
        created_at: env.ledger().timestamp(),
        active: true,
        period_closed: false,
        period_label: String::from_str(env, ""),
    };

    storage::save_household(env, &household);

    // Owner is automatically a member
    let owner_member = Member {
        address: owner.clone(),
        display_name: String::from_str(env, "Owner"),
        joined_at: env.ledger().timestamp(),
        active: true,
    };
    let mut members: Vec<Member> = Vec::new(env);
    members.push_back(owner_member);
    storage::save_members(env, id, &members);

    events::household_created(env, id, &owner, &name);
    Ok(id)
}

pub fn add_member(
    env: &Env,
    household_id: u64,
    caller: Address,
    member_address: Address,
    display_name: String,
) -> Result<(), ContractError> {
    let household = storage::get_household(env, household_id)?;

    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    // Only the owner can add members
    if household.owner != caller {
        return Err(ContractError::UnauthorizedMutation);
    }

    let mut members = storage::get_members(env, household_id)?;

    // Check for duplicate
    for i in 0..members.len() {
        let m = members.get(i).unwrap();
        if m.address == member_address {
            if m.active {
                return Err(ContractError::MemberAlreadyExists);
            }
            // Re-activate inactive member
            let updated = Member {
                active: true,
                display_name: display_name.clone(),
                ..m
            };
            members.set(i, updated);
            storage::save_members(env, household_id, &members);
            events::member_added(env, household_id, &member_address, &display_name);
            return Ok(());
        }
    }

    let new_member = Member {
        address: member_address.clone(),
        display_name: display_name.clone(),
        joined_at: env.ledger().timestamp(),
        active: true,
    };
    members.push_back(new_member);
    storage::save_members(env, household_id, &members);
    events::member_added(env, household_id, &member_address, &display_name);
    Ok(())
}

pub fn remove_member(
    env: &Env,
    household_id: u64,
    caller: Address,
    member_address: Address,
) -> Result<(), ContractError> {
    let household = storage::get_household(env, household_id)?;

    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    if household.owner != caller {
        return Err(ContractError::UnauthorizedMutation);
    }

    // Cannot remove the owner
    if household.owner == member_address {
        return Err(ContractError::CannotRemoveOwner);
    }

    let mut members = storage::get_members(env, household_id)?;
    let mut found = false;

    for i in 0..members.len() {
        let m = members.get(i).unwrap();
        if m.address == member_address {
            let updated = Member { active: false, ..m };
            members.set(i, updated);
            found = true;
            break;
        }
    }

    if !found {
        return Err(ContractError::MemberNotFound);
    }

    storage::save_members(env, household_id, &members);
    events::member_removed(env, household_id, &member_address);
    Ok(())
}

pub fn close_period(
    env: &Env,
    household_id: u64,
    caller: Address,
    period_label: String,
) -> Result<(), ContractError> {
    let mut household = storage::get_household(env, household_id)?;

    if !household.active {
        return Err(ContractError::HouseholdInactive);
    }

    if household.owner != caller {
        return Err(ContractError::UnauthorizedMutation);
    }

    if household.period_closed {
        return Err(ContractError::PeriodAlreadyClosed);
    }

    // All member balances must be zero
    let balances = balances::get_all_balances(env, household_id)?;
    for i in 0..balances.len() {
        let b = balances.get(i).unwrap();
        if b.net_balance != 0 {
            return Err(ContractError::OutstandingBalances);
        }
    }

    household.period_closed = true;
    household.period_label = period_label.clone();
    storage::save_household(env, &household);

    events::period_closed(env, household_id, &period_label);
    Ok(())
}
