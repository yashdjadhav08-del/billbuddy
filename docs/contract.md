# BillBuddy Soroban Contract

## Contract ID

After deployment, set in `apps/web/.env.local`:
```
VITE_SOROBAN_CONTRACT_ID=<contract-id>
```

## Public interface

| Method | Auth | Description |
|---|---|---|
| `create_household(name, owner)` | owner | Create a household; owner is first member |
| `get_household(id)` | — | Read household state |
| `add_member(id, caller, address, name)` | owner | Add a member by Stellar address |
| `remove_member(id, caller, address)` | owner | Deactivate a member |
| `get_members(id)` | — | List all members |
| `create_bill(id, creator, ...)` | member | Create a bill with shares and contributions |
| `update_bill(id, bill_id, caller, ...)` | creator or owner | Update bill (not if settled) |
| `delete_bill(id, bill_id, caller)` | creator or owner | Permanently delete a bill (not if settled) |
| `get_bill(id, bill_id)` | — | Read a bill |
| `get_bills(id)` | — | List all bills |
| `get_balance(id, member)` | — | Net balance for one member |
| `get_all_balances(id)` | — | All member balances |
| `create_settlement(id, payer, receiver, amount, asset)` | payer | Record a pending settlement |
| `complete_settlement(id, settlement_id, payer, tx_hash)` | payer | Mark completed with real tx hash |
| `fail_settlement(id, settlement_id, payer)` | payer | Mark failed |
| `get_settlement(id, settlement_id)` | — | Read a settlement |
| `get_settlements(id)` | — | List all settlements |
| `close_period(id, caller, label)` | owner | Lock period (requires zero balances) |

## Events emitted

| Event | Topics | Data |
|---|---|---|
| `HouseholdCreated` | `(symbol, household_id, owner)` | `name` |
| `MemberAdded` | `(symbol, household_id, address)` | `display_name` |
| `MemberRemoved` | `(symbol, household_id, address)` | `()` |
| `PeriodClosed` | `(symbol, household_id)` | `period_label` |
| `BillCreated` | `(symbol, household_id, bill_id, creator)` | `amount` |
| `BillUpdated` | `(symbol, household_id, bill_id)` | `()` |
| `BillSettled` | `(symbol, household_id, bill_id)` | `()` |
| `BillDeleted` | `(symbol, household_id, bill_id, deleter)` | `()` |
| `SettlementCreated` | `(symbol, household_id, settlement_id, payer)` | `(receiver, amount)` |
| `SettlementCompleted` | `(symbol, household_id, settlement_id, payer)` | `tx_hash` |
| `SettlementFailed` | `(symbol, household_id, settlement_id)` | `()` |

## Bill lifecycle

A bill starts `Active`. `pay_bill` credits a payer's contribution and recredits
the funders' fronted amounts; once **every participant's contribution covers
their share**, the bill flips to `Settled` and emits `BillSettled`.

Settled bills are locked: `update_bill`, `delete_bill`, and further `pay_bill`
calls are rejected (`BillAlreadySettled` / `CannotDeleteSettledBill`), and they
are excluded from balance calculations since they no longer affect net balances.

## Error codes

| Code | Value | Meaning |
|---|---|---|
| `HouseholdNotFound` | 100 | No household at given ID |
| `HouseholdInactive` | 102 | Household has been deactivated |
| `PeriodAlreadyClosed` | 103 | Period close attempted twice |
| `OutstandingBalances` | 104 | Cannot close with non-zero balances |
| `MemberNotFound` | 200 | Address not in household |
| `MemberAlreadyExists` | 201 | Duplicate member add |
| `UnauthorizedMutation` | 203 | Caller is not the owner |
| `CannotRemoveOwner` | 204 | Owner cannot be removed |
| `BillNotFound` | 300 | No bill at given ID |
| `InvalidAmount` | 301 | Zero or negative amount |
| `SplitMismatch` | 303 | Shares do not sum to total |
| `BillAlreadySettled` | 304 | Cannot update a settled bill |
| `UnauthorizedBillMutation` | 305 | Caller is not the bill creator or household owner |
| `CannotDeleteSettledBill` | 309 | Cannot delete a settled bill |
| `SettlementNotFound` | 400 | No settlement at given ID |
| `SettlementAlreadyCompleted` | 401 | Cannot complete twice |
| `DuplicateSettlement` | 405 | Identical pending settlement exists |

## Storage model

All state uses Soroban persistent storage with typed enum keys:

```rust
enum StorageKey {
    Household(u64),
    Members(u64),
    Bill(u64, u64),      // (household_id, bill_id)
    Bills(u64),          // ordered ID list
    Settlement(u64, u64),
    Settlements(u64),
}
```

Auto-incrementing counters for household, bill, and settlement IDs are stored as separate persistent keys.
