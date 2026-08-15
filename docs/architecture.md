# BillBuddy Architecture

## System diagram

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              React Application                   │   │
│  │                                                  │   │
│  │  pages/        hooks/         stores/            │   │
│  │  Landing       useWallet      walletStore        │   │
│  │  Dashboard     useHousehold   appStore           │   │
│  │  Household     useBill                           │   │
│  │  CreateBill    useSettlement  lib/               │   │
│  │  BillDetails   useSync        money (cents)      │   │
│  │  Settlement                   balance            │   │
│  │  MonthlyClose                 settlement algo    │   │
│  │                               split validator    │   │
│  └──────────────────────────────────────────────────┘   │
│          │                │                             │
│          ▼                ▼                             │
│  ┌──────────────┐  ┌─────────────────┐                 │
│  │ walletService│  │ contractService │                 │
│  │ (Freighter)  │  │ (Soroban RPC)   │                 │
│  └──────────────┘  └─────────────────┘                 │
│          │                │                             │
│          │         ┌──────────────┐                    │
│          │         │stellarService│                    │
│          │         │ (Horizon)    │                    │
│          └─────────┴──────────────┘                    │
└─────────────────────────────────────────────────────────┘
                      │         │
          ┌───────────┘         └───────────────┐
          ▼                                     ▼
  Freighter Extension               Stellar Testnet
  (signs XDR, never                   │
   exposes private key)               ├─ Horizon RPC
                                      │  (payment submission,
                                      │   tx confirmation)
                                      │
                                      └─ Soroban RPC
                                         (contract invocation,
                                          state queries)
                                              │
                                              ▼
                                    BillBuddy Contract
                                    (Rust / WASM)
                                    ├─ Household storage
                                    ├─ Bill storage
                                    ├─ Balance logic
                                    ├─ Settlement FSM
                                    └─ Events
```

## Money representation

All monetary values are stored and computed as **integer minor units (cents)**.

```
$32.50 → 3250 cents
$800   → 80000 cents
```

JavaScript floating-point is never used as the authoritative source for monetary arithmetic. The `lib/money.ts` module provides safe integer conversion helpers.

On the Stellar side, 1 cent maps to 1 stroop (0.0000001 XLM). This keeps the demo simple while maintaining integer precision throughout.

## Balance invariant

For any set of bills and completed settlements, net balances across all members must sum to zero:

```
∑ netBalance(member) = 0   ∀ households
```

This invariant is verified by `balancesAreConserved()` in `lib/balance.ts` and by the `test_all_balances` Rust test.

## Settlement optimizer

The greedy algorithm runs in O(n log n) and produces the minimum number of transfers for the general case:

1. Separate creditors (+) and debtors (-)
2. Sort both lists descending by magnitude
3. Greedily match largest creditor with largest debtor
4. The smaller of the two is fully resolved; advance that pointer

Result: at most n−1 transfers for n members.

## Contract state machine

```
Settlement status:
  Pending → (Freighter signs) → Submitted
  Submitted → (Horizon confirms) → Completed
  Submitted → (error) → Failed
  Pending → (user cancels) → Failed
```

The contract enforces that:
- Only the payer can complete or fail their settlement
- A completed settlement cannot be re-completed
- A failed settlement cannot be completed
- Duplicate pending settlements between same payer/receiver/amount are rejected
