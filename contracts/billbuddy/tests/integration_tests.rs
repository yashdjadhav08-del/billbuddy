#![cfg(test)]
#![allow(clippy::cloned_ref_to_slice_refs)]

extern crate std;

use billbuddy::{
    BillBuddyContract, BillBuddyContractClient, BillCategory, BillStatus, ContractError,
    MemberContribution, MemberShare, SettlementStatus, SplitType,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

// ─── Test helpers ─────────────────────────────────────────────────────────────

fn create_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn deploy(env: &Env) -> BillBuddyContractClient<'_> {
    let contract_id = env.register_contract(None, BillBuddyContract);
    BillBuddyContractClient::new(env, &contract_id)
}

fn addr(env: &Env) -> Address {
    Address::generate(env)
}

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

fn equal_shares(env: &Env, members: &[Address], total: i128) -> Vec<MemberShare> {
    let per = total / members.len() as i128;
    let mut remainder = total - per * members.len() as i128;
    let mut shares = Vec::new(env);
    for m in members {
        let extra = if remainder > 0 { 1 } else { 0 };
        remainder -= extra;
        shares.push_back(MemberShare {
            member: m.clone(),
            amount: per + extra,
        });
    }
    shares
}

fn contributions(env: &Env, pairs: &[(Address, i128)]) -> Vec<MemberContribution> {
    let mut c = Vec::new(env);
    for (addr, amt) in pairs {
        c.push_back(MemberContribution {
            member: addr.clone(),
            amount: *amt,
        });
    }
    c
}

fn zero_contributions(env: &Env, members: &[Address]) -> Vec<MemberContribution> {
    contributions(
        env,
        &members
            .iter()
            .map(|m| (m.clone(), 0i128))
            .collect::<std::vec::Vec<_>>(),
    )
}

// ─── Household Tests ──────────────────────────────────────────────────────────

#[test]
fn test_create_household() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);

    let id = client.create_household(&s(&env, "Apartment 204"), &owner);
    assert_eq!(id, 1);

    let hh = client.get_household(&id);
    assert_eq!(hh.id, 1);
    assert!(hh.active);
    assert!(!hh.period_closed);
    assert_eq!(hh.owner, owner);
}

#[test]
fn test_add_member() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let members = client.get_members(&hh_id);
    assert_eq!(members.len(), 2); // owner + alice
}

#[test]
fn test_add_duplicate_member_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let result = client.try_add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::MemberAlreadyExists
    );
}

#[test]
fn test_non_owner_cannot_add_member() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let bob = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    // alice tries to add bob — should fail
    let result = client.try_add_member(&hh_id, &alice, &bob, &s(&env, "Bob"));
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::UnauthorizedMutation
    );
}

#[test]
fn test_remove_member() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));
    client.remove_member(&hh_id, &owner, &alice);

    let members = client.get_members(&hh_id);
    // alice still in list but inactive; only owner is active
    let active: std::vec::Vec<_> = (0..members.len())
        .map(|i| members.get(i).unwrap())
        .filter(|m| m.active)
        .collect();
    assert_eq!(active.len(), 1);
}

#[test]
fn test_cannot_remove_owner() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    let result = client.try_remove_member(&hh_id, &owner, &owner);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::CannotRemoveOwner
    );
}

// ─── Bill Tests ───────────────────────────────────────────────────────────────

#[test]
fn test_create_bill_equal_split() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let members = [owner.clone(), alice.clone()];
    let shares = equal_shares(&env, &members, 10000); // $100.00
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);

    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    assert_eq!(bill_id, 1);
    let bill = client.get_bill(&hh_id, &bill_id);
    assert_eq!(bill.total_amount, 10000);
    assert_eq!(bill.status, BillStatus::Active);
}

#[test]
fn test_create_bill_invalid_amount_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    let shares = equal_shares(&env, &[owner.clone()], 1);
    let contribs = zero_contributions(&env, &[owner.clone()]);
    // negative amount
    let result = client.try_create_bill(
        &hh_id,
        &owner,
        &s(&env, "Bad"),
        &BillCategory::Custom,
        &-100i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );
    assert!(result.is_err());
}

#[test]
fn test_create_bill_split_mismatch_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    // Shares sum to 9000 but total is 10000 → mismatch
    let mut shares = Vec::new(&env);
    shares.push_back(MemberShare {
        member: owner.clone(),
        amount: 5000,
    });
    shares.push_back(MemberShare {
        member: alice.clone(),
        amount: 4000,
    });
    let contribs = zero_contributions(&env, &[owner.clone(), alice.clone()]);

    let result = client.try_create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::CustomAmount,
        &shares,
        &contribs,
    );
    assert_eq!(result.err().unwrap().unwrap(), ContractError::SplitMismatch);
}

#[test]
fn test_create_bill_non_member_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let stranger = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    let shares = equal_shares(&env, &[owner.clone()], 10000);
    let contribs = zero_contributions(&env, &[owner.clone()]);
    let result = client.try_create_bill(
        &hh_id,
        &stranger,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::UnauthorizedMutation
    );
}

#[test]
fn test_update_bill() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    let shares = equal_shares(&env, &[owner.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    let new_shares = equal_shares(&env, &[owner.clone()], 12000);
    let new_contribs = contributions(&env, &[(owner.clone(), 12000)]);
    client.update_bill(
        &hh_id,
        &bill_id,
        &owner,
        &s(&env, "Rent Updated"),
        &BillCategory::Rent,
        &12000i128,
        &0u64,
        &SplitType::Equal,
        &new_shares,
        &new_contribs,
    );

    let bill = client.get_bill(&hh_id, &bill_id);
    assert_eq!(bill.total_amount, 12000);
}

// ─── Balance Tests ────────────────────────────────────────────────────────────

#[test]
fn test_balance_positive_creditor() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    // Owner pays $100 for both; equal split → $50 each
    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    let owner_bal = client.get_balance(&hh_id, &owner);
    let alice_bal = client.get_balance(&hh_id, &alice);

    assert_eq!(owner_bal, 5000); // paid 10000, owes 5000 → +5000
    assert_eq!(alice_bal, -5000); // paid 0, owes 5000 → -5000
}

#[test]
fn test_balance_zero() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    // Owner pays exactly their share
    let shares = equal_shares(&env, &[owner.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    let bal = client.get_balance(&hh_id, &owner);
    assert_eq!(bal, 0);
}

#[test]
fn test_balance_multiple_bills() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let members = [owner.clone(), alice.clone()];

    // Bill 1: owner pays $80, equal split ($40 each) → owner net +40
    let s1 = equal_shares(&env, &members, 8000);
    let c1 = contributions(&env, &[(owner.clone(), 8000), (alice.clone(), 0)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "B1"),
        &BillCategory::Electricity,
        &8000i128,
        &0u64,
        &SplitType::Equal,
        &s1,
        &c1,
    );

    // Bill 2: alice pays $60, equal split ($30 each) → alice net +30
    let s2 = equal_shares(&env, &members, 6000);
    let c2 = contributions(&env, &[(owner.clone(), 0), (alice.clone(), 6000)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "B2"),
        &BillCategory::Internet,
        &6000i128,
        &0u64,
        &SplitType::Equal,
        &s2,
        &c2,
    );

    // owner: paid 8000, owed 8000+6000=14000 share 4000+3000=7000 → net = 8000-7000 = 1000
    let owner_bal = client.get_balance(&hh_id, &owner);
    assert_eq!(owner_bal, 1000);

    // alice: paid 6000, owed 7000 → net = 6000-7000 = -1000
    let alice_bal = client.get_balance(&hh_id, &alice);
    assert_eq!(alice_bal, -1000);
}

#[test]
fn test_all_balances() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    let balances = client.get_all_balances(&hh_id);
    assert_eq!(balances.len(), 2);
    let sum: i128 = (0..balances.len())
        .map(|i| balances.get(i).unwrap().net_balance)
        .sum();
    assert_eq!(sum, 0); // balances must always sum to zero
}

// ─── Settlement Tests ─────────────────────────────────────────────────────────

#[test]
fn test_create_settlement() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let sid = client.create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));
    assert_eq!(sid, 1);

    let settlement = client.get_settlement(&hh_id, &sid);
    assert_eq!(settlement.amount, 5000);
    assert_eq!(settlement.status, SettlementStatus::Pending);
}

#[test]
fn test_complete_settlement() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let sid = client.create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));

    client.complete_settlement(&hh_id, &sid, &alice, &s(&env, "abc123txhash"));

    let settlement = client.get_settlement(&hh_id, &sid);
    assert_eq!(settlement.status, SettlementStatus::Completed);
    assert_eq!(settlement.transaction_hash, s(&env, "abc123txhash"));
}

#[test]
fn test_complete_settlement_wrong_payer_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let bob = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));
    client.add_member(&hh_id, &owner, &bob, &s(&env, "Bob"));

    let sid = client.create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));

    // bob tries to complete alice's settlement
    let result = client.try_complete_settlement(&hh_id, &sid, &bob, &s(&env, "fakehash"));
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::UnauthorizedSettlement
    );
}

#[test]
fn test_double_complete_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let sid = client.create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));
    client.complete_settlement(&hh_id, &sid, &alice, &s(&env, "hash1"));

    let result = client.try_complete_settlement(&hh_id, &sid, &alice, &s(&env, "hash2"));
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::SettlementAlreadyCompleted
    );
}

#[test]
fn test_fail_settlement() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let sid = client.create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));
    client.fail_settlement(&hh_id, &sid, &alice);

    let settlement = client.get_settlement(&hh_id, &sid);
    assert_eq!(settlement.status, SettlementStatus::Failed);
}

#[test]
fn test_duplicate_settlement_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    client.create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));
    let result = client.try_create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::DuplicateSettlement
    );
}

// ─── Monthly Close Tests ──────────────────────────────────────────────────────

#[test]
fn test_close_period_fails_with_outstanding_balances() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    let result = client.try_close_period(&hh_id, &owner, &s(&env, "August 2026"));
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::OutstandingBalances
    );
}

#[test]
fn test_close_period_succeeds_when_settled() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    // owner pays and is owed exactly the same amount → zero balance
    let shares = equal_shares(&env, &[owner.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    client.close_period(&hh_id, &owner, &s(&env, "August 2026"));
    let hh = client.get_household(&hh_id);
    assert!(hh.period_closed);
}

#[test]
fn test_close_period_twice_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    let shares = equal_shares(&env, &[owner.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000)]);
    client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Rent"),
        &BillCategory::Rent,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    client.close_period(&hh_id, &owner, &s(&env, "August 2026"));
    let result = client.try_close_period(&hh_id, &owner, &s(&env, "August 2026"));
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::PeriodAlreadyClosed
    );
}

// ─── Shared-State Bill Discovery Tests ────────────────────────────────────────

#[test]
fn test_create_bill_with_non_member_participant() {
    // A bill can include any wallet address selected by the creator — household
    // membership is NOT required (crowdfunding-style shared-state inclusion).
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let stranger = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    let shares = equal_shares(&env, &[owner.clone(), stranger.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (stranger.clone(), 0)]);

    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    let bill = client.get_bill(&hh_id, &bill_id);
    assert!(bill.shares.len() == 2);
}

#[test]
fn test_get_member_bills_across_households() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    // Household 1: owner + alice
    let hh1 = client.create_household(&s(&env, "Apt A"), &owner);
    client.add_member(&hh1, &owner, &alice, &s(&env, "Alice"));

    let shares1 = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs1 = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    client.create_bill(
        &hh1,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares1,
        &contribs1,
    );

    // Household 2: owner + alice again
    let hh2 = client.create_household(&s(&env, "Apt B"), &owner);
    client.add_member(&hh2, &owner, &alice, &s(&env, "Alice"));

    let shares2 = equal_shares(&env, &[owner.clone(), alice.clone()], 5000);
    let contribs2 = contributions(&env, &[(owner.clone(), 5000), (alice.clone(), 0)]);
    client.create_bill(
        &hh2,
        &owner,
        &s(&env, "Lunch"),
        &BillCategory::Custom,
        &5000i128,
        &0u64,
        &SplitType::Equal,
        &shares2,
        &contribs2,
    );

    // Alice discovers BOTH bills from shared state by her wallet address alone.
    let alice_bills = client.get_member_bills(&alice);
    assert_eq!(alice_bills.len(), 2);

    // A stranger who was never selected sees nothing.
    let stranger = addr(&env);
    assert_eq!(client.get_member_bills(&stranger).len(), 0);
}

#[test]
fn test_bill_participant_can_pay() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    // Owner fronts $100 for Dinner, equal split ($50 each).
    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    // Before: alice owes 5000.
    assert_eq!(client.get_balance(&hh_id, &alice), -5000);

    // Alice signs a real Soroban transaction paying her $50 share.
    client.pay_bill(&hh_id, &bill_id, &alice, &5000i128);

    let bill = client.get_bill(&hh_id, &bill_id);
    // Alice's contribution is now credited; the owner's fronted amount drops.
    let alice_contrib = (0..bill.contributions.len())
        .map(|i| bill.contributions.get(i).unwrap())
        .find(|c| c.member == alice)
        .unwrap();
    let owner_contrib = (0..bill.contributions.len())
        .map(|i| bill.contributions.get(i).unwrap())
        .find(|c| c.member == owner)
        .unwrap();
    assert_eq!(alice_contrib.amount, 5000);
    assert_eq!(owner_contrib.amount, 5000);
    // Contribution total is conserved.
    let sum: i128 = (0..bill.contributions.len())
        .map(|i| bill.contributions.get(i).unwrap().amount)
        .sum();
    assert_eq!(sum, 10000);

    // Both members are now square on the bill.
    assert_eq!(client.get_balance(&hh_id, &alice), 0);
    assert_eq!(client.get_balance(&hh_id, &owner), 0);
}

#[test]
fn test_pay_bill_overpayment_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    // Alice tries to pay $80 against her $50 share.
    let result = client.try_pay_bill(&hh_id, &bill_id, &alice, &8000i128);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::BillPaymentTooLarge
    );

    // Double payment fails (and the bill settles once Alice's share is paid).
    client.pay_bill(&hh_id, &bill_id, &alice, &5000i128);
    let result = client.try_pay_bill(&hh_id, &bill_id, &alice, &1000i128);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::BillAlreadySettled
    );
}

#[test]
fn test_pay_bill_non_participant_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let stranger = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);

    let shares = equal_shares(&env, &[owner.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    let result = client.try_pay_bill(&hh_id, &bill_id, &stranger, &1000i128);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::NotBillParticipant
    );
}

#[test]
fn test_delete_bill_removes_from_shared_state() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let stranger = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    // Both participants discover the bill from shared state.
    assert_eq!(client.get_member_bills(&alice).len(), 1);
    assert_eq!(client.get_member_bills(&owner).len(), 1);

    // Non-authorized users cannot delete.
    let result = client.try_delete_bill(&hh_id, &bill_id, &stranger);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::UnauthorizedBillMutation
    );

    // Deleting works for the creator.
    client.delete_bill(&hh_id, &bill_id, &owner);

    // Bill is gone everywhere: household query, member discovery, direct fetch.
    assert_eq!(client.get_bills(&hh_id).len(), 0);
    assert_eq!(client.get_member_bills(&alice).len(), 0);
    assert_eq!(client.get_member_bills(&owner).len(), 0);
    let result = client.try_get_bill(&hh_id, &bill_id);
    assert_eq!(result.err().unwrap().unwrap(), ContractError::BillNotFound);
}

#[test]
fn test_delete_bill_non_authorized_participant_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    // A participant who is neither the creator nor the owner cannot delete.
    let result = client.try_delete_bill(&hh_id, &bill_id, &alice);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::UnauthorizedBillMutation
    );

    // The bill creator (who is a member but not the household owner) CAN delete.
    let other_owner = client.create_household(&s(&env, "Other"), &alice);
    client.add_member(&other_owner, &alice, &owner, &s(&env, "Owner"));
    let shares2 = equal_shares(&env, &[alice.clone(), owner.clone()], 5000);
    let contribs2 = contributions(&env, &[(alice.clone(), 5000), (owner.clone(), 0)]);
    let bill2 = client.create_bill(
        &other_owner,
        &owner,
        &s(&env, "Lunch"),
        &BillCategory::Custom,
        &5000i128,
        &0u64,
        &SplitType::Equal,
        &shares2,
        &contribs2,
    );
    client.delete_bill(&other_owner, &bill2, &owner);
    assert_eq!(client.get_bills(&other_owner).len(), 0);
}

#[test]
fn test_pay_bill_marks_settled_when_fully_paid() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    // Owner fronts $100; equal split $50 each.
    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );
    assert_eq!(client.get_bill(&hh_id, &bill_id).status, BillStatus::Active);

    // Alice pays her share → the bill is fully covered → it settles.
    client.pay_bill(&hh_id, &bill_id, &alice, &5000i128);
    assert_eq!(
        client.get_bill(&hh_id, &bill_id).status,
        BillStatus::Settled
    );

    // Settled bills are locked: no more payments, updates, or deletes.
    let result = client.try_pay_bill(&hh_id, &bill_id, &alice, &5000i128);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::BillAlreadySettled
    );
    let result = client.try_delete_bill(&hh_id, &bill_id, &owner);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::CannotDeleteSettledBill
    );

    // Still present in shared state for both participants.
    assert_eq!(client.get_bills(&hh_id).len(), 1);
    assert_eq!(client.get_member_bills(&alice).len(), 1);
}

#[test]
fn test_delete_bill_settled_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let shares = equal_shares(&env, &[owner.clone(), alice.clone()], 10000);
    let contribs = contributions(&env, &[(owner.clone(), 10000), (alice.clone(), 0)]);
    let bill_id = client.create_bill(
        &hh_id,
        &owner,
        &s(&env, "Dinner"),
        &BillCategory::Custom,
        &10000i128,
        &0u64,
        &SplitType::Equal,
        &shares,
        &contribs,
    );

    // Pay until the bill is fully settled.
    client.pay_bill(&hh_id, &bill_id, &alice, &5000i128);
    assert_eq!(
        client.get_bill(&hh_id, &bill_id).status,
        BillStatus::Settled
    );

    // Even the creator cannot delete a settled bill.
    let result = client.try_delete_bill(&hh_id, &bill_id, &owner);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::CannotDeleteSettledBill
    );

    // Bill is untouched and still discoverable.
    assert_eq!(client.get_bills(&hh_id).len(), 1);
    assert_eq!(client.get_member_bills(&owner).len(), 1);
}

// ─── Inter-contract communication (token/SAC) tests ──────────────────────────

/// Deploy a Stellar Asset Contract and mint `amount` tokens to `beneficiary`.
fn deploy_token(env: &Env, admin: &Address, beneficiary: &Address, amount: i128) -> Address {
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    let token_id = env.register_stellar_asset_contract(admin.clone());
    env.mock_all_auths();

    let token = TokenClient::new(env, &token_id);
    if amount > 0 {
        StellarAssetClient::new(env, &token_id).mint(beneficiary, &amount);
    }
    assert_eq!(token.balance(beneficiary), amount);
    token_id
}

#[test]
fn test_pay_settlement_transfers_tokens_onchain() {
    use soroban_sdk::token::TokenClient;

    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let token_admin = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    // Alice holds 10_000 tokens; owner holds 0.
    let token_id = deploy_token(&env, &token_admin, &alice, 10_000i128);

    let sid = client.create_settlement(&hh_id, &alice, &owner, &5000i128, &s(&env, "XLM"));

    // Inter-contract call: BillBuddy invokes the token contract to move funds.
    client.pay_settlement(&hh_id, &sid, &alice, &token_id);

    let token = TokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&alice), 5_000);
    assert_eq!(token.balance(&owner), 5_000);

    // Settlement is completed and has no balance impact on the ledger itself.
    let settlement = client.get_settlement(&hh_id, &sid);
    assert_eq!(settlement.status, SettlementStatus::Completed);
}

#[test]
fn test_pay_settlement_transfers_full_balance() {
    use soroban_sdk::token::TokenClient;

    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let bob = addr(&env);
    let token_admin = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &bob, &s(&env, "Bob"));

    // Bob holds exactly the amount owed.
    let token_id = deploy_token(&env, &token_admin, &bob, 7_500i128);

    let sid = client.create_settlement(&hh_id, &bob, &owner, &7_500i128, &s(&env, "XLM"));
    client.pay_settlement(&hh_id, &sid, &bob, &token_id);

    let token = TokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&bob), 0);
    assert_eq!(token.balance(&owner), 7_500);
}

#[test]
fn test_pay_settlement_insufficient_balance_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let carol = addr(&env);
    let token_admin = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &carol, &s(&env, "Carol"));

    // Carol only holds 100 tokens but owes 5_000.
    let token_id = deploy_token(&env, &token_admin, &carol, 100i128);

    let sid = client.create_settlement(&hh_id, &carol, &owner, &5_000i128, &s(&env, "XLM"));
    let result = client.try_pay_settlement(&hh_id, &sid, &carol, &token_id);

    // Token contract rejects the transfer → BillBuddy surfaces TokenTransferFailed.
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::TokenTransferFailed
    );

    // Settlement is still pending — nothing moved on-chain.
    let settlement = client.get_settlement(&hh_id, &sid);
    assert_eq!(settlement.status, SettlementStatus::Pending);
}

#[test]
fn test_pay_settlement_wrong_payer_fails() {
    use soroban_sdk::token::TokenClient;

    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let mallory = addr(&env);
    let token_admin = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let token_id = deploy_token(&env, &token_admin, &alice, 10_000i128);
    let sid = client.create_settlement(&hh_id, &alice, &owner, &5_000i128, &s(&env, "XLM"));

    // Mallory (not the payer) cannot settle alice's debt.
    let result = client.try_pay_settlement(&hh_id, &sid, &mallory, &token_id);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::UnauthorizedSettlement
    );

    let token = TokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&alice), 10_000); // untouched
}

#[test]
fn test_pay_settlement_already_completed_fails() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let alice = addr(&env);
    let token_admin = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &alice, &s(&env, "Alice"));

    let token_id = deploy_token(&env, &token_admin, &alice, 10_000i128);
    let sid = client.create_settlement(&hh_id, &alice, &owner, &5_000i128, &s(&env, "XLM"));

    client.pay_settlement(&hh_id, &sid, &alice, &token_id);
    let result = client.try_pay_settlement(&hh_id, &sid, &alice, &token_id);
    assert_eq!(
        result.err().unwrap().unwrap(),
        ContractError::SettlementAlreadyCompleted
    );
}

#[test]
fn test_get_token_balance_inter_contract_read() {
    let env = create_env();
    let client = deploy(&env);
    let owner = addr(&env);
    let dave = addr(&env);
    let token_admin = addr(&env);

    let hh_id = client.create_household(&s(&env, "Apt"), &owner);
    client.add_member(&hh_id, &owner, &dave, &s(&env, "Dave"));

    let token_id = deploy_token(&env, &token_admin, &dave, 4_200i128);

    // Read-only inter-contract call returns the token contract's balance.
    let balance = client.get_token_balance(&dave, &token_id);
    assert_eq!(balance, 4_200);

    // Non-participant address reads 0 from the same token contract.
    let stranger = addr(&env);
    assert_eq!(client.get_token_balance(&stranger, &token_id), 0);
}
