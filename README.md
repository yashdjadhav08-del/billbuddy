# BillBuddy

**Split bills. Settle simply.**

Track household expenses, calculate balances automatically, and settle with real Stellar payments.

---

## Overview

BillBuddy solves one problem: after roommates share household expenses, who should pay whom, and exactly how much?

Every household bill is recorded with a flexible split (equal, custom, or percentage). BillBuddy calculates each member's net position and generates an optimized settlement plan — the minimum number of transfers to zero all balances. Settlements are signed through Freighter and submitted as real XLM payments on Stellar Testnet. The BillBuddy Soroban contract records each settlement and emits `SettlementCompleted` on-chain.

---

## Features

| Feature | Detail |
|---|---|
| Household management | Create a household, add/remove members by Stellar address |
| Bill tracking | Rent, electricity, water, internet, groceries, streaming, maintenance |
| Bill deletion | Remove a bill (creator or owner; settled bills locked) |
| Flexible splits | Equal, custom amount, percentage (with live validation) |
| Balance calculation | Integer-arithmetic net balances, conservation guaranteed |
| Optimized settlements | Greedy minimum-transfer algorithm |
| Freighter integration | Connect, sign, reject — no private keys ever touched |
| Real Stellar payments | XLM payments on Testnet, real transaction hashes |
| Soroban contract | Household + bill + settlement state, authorization enforced |
| Contract events | `HouseholdCreated`, `BillCreated`, `SettlementCompleted`, etc. |
| State sync | 15-second polling + visibility-change resync |
| Monthly close | Lock period once all balances reach zero |
| Mock mode | `VITE_MOCK_MODE=true` for local UI development without a deployed contract |

---

## Architecture

```
Browser
  │
  ├─ React + Vite + Tailwind (mobile-first)
  │    ├─ Zustand stores (wallet, app state)
  │    ├─ TanStack Query (server state)
  │    └─ react-hot-toast (notifications)
  │
  ├─ Freighter Wallet
  │    └─ Signs transactions — never sees private keys
  │
  ├─ walletService      → Freighter API wrapper
  ├─ stellarService     → Build / submit / confirm XLM payments
  └─ contractService    → Soroban RPC calls (+ mock mode)
          │
          ▼
  Stellar Testnet (Horizon + Soroban RPC)
          │
          ▼
  BillBuddy Soroban Contract (Rust)
          │
          ├─ Household State
          ├─ Member State
          ├─ Bill State   (shares + contributions)
          ├─ Balance logic (on-chain net balance)
          └─ Settlement State Machine
               Pending → Submitted → Completed | Failed
```

---

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- Rust stable + `wasm32-unknown-unknown` target (for contract)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli) (`stellar`)
- [Freighter browser extension](https://www.freighter.app)

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/billbuddy.git
cd billbuddy
npm install --workspace=apps/web
```

### 2. Configure environment

```bash
cp .env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
VITE_STELLAR_NETWORK=testnet
VITE_SOROBAN_CONTRACT_ID=<your-deployed-contract-id>
VITE_ASSET_CODE=XLM
VITE_MOCK_MODE=false          # set true for UI-only development
```

### 3. Run the frontend

```bash
npm run dev --workspace=apps/web
# → http://localhost:5173
```

To develop without a deployed contract, set `VITE_MOCK_MODE=true`.
This is a developer-only fallback — it is never used as the source of truth.

### 4. Deploy the contract (one command)

```bash
./scripts/deploy-contract.sh
```

This builds, funds a deployer via Friendbot, deploys to Testnet and writes the
contract ID into `apps/web/.env.local`. (Requires `stellar-cli` and a built WASM —
see *Contract Deployment* below.)

---

## Contract Deployment

### 1. Install Rust WASM target

```bash
rustup target add wasm32-unknown-unknown
```

### 2. Install Stellar CLI

```bash
# macOS / Linux
cargo install --locked stellar-cli --features opt

# Or via homebrew
brew install stellar/tap/stellar-cli
```

### 3. Build the contract

```bash
cd contracts/billbuddy
cargo build --target wasm32-unknown-unknown --release
```

The WASM is at:
```
target/wasm32-unknown-unknown/release/billbuddy.wasm
```

### 4. Configure Stellar CLI for Testnet

```bash
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

### 5. Create a deployer identity

```bash
stellar keys generate deployer --network testnet
stellar keys address deployer
```

Fund it:
```bash
curl "https://friendbot.stellar.org/?addr=$(stellar keys address deployer)"
```

### 6. Deploy

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/billbuddy.wasm \
  --source deployer \
  --network testnet
```

Copy the returned contract ID into `apps/web/.env.local`:
```env
VITE_SOROBAN_CONTRACT_ID=CXXXXX...
```

---

## Testnet Wallet Setup

### Install Freighter

1. Install [Freighter](https://www.freighter.app) browser extension.
2. Create or import a wallet.
3. Switch to **Testnet** in Freighter settings.

### Fund your account

Open the Stellar Friendbot URL in your browser:
```
https://friendbot.stellar.org/?addr=YOUR_STELLAR_ADDRESS
```

Or via curl:
```bash
curl "https://friendbot.stellar.org/?addr=GYOUR_ADDRESS_HERE"
```

This gives you **10,000 XLM** on Testnet.

### Verify on Explorer

```
https://stellar.expert/explorer/testnet/account/YOUR_ADDRESS
```

---

## Asset / Payment Design

BillBuddy uses **native XLM** as the settlement asset for simplicity and trustlessness.

- No issuer, no trustline required
- Available on every Testnet account via Friendbot
- 1 cent (minor unit) = 1 stroop = 0.0000001 XLM

The Soroban contract records settlement metadata (payer, receiver, amount, tx hash).
The actual XLM transfer is a standard Stellar Classic payment operation, signed by Freighter.

To use a custom asset (e.g., USDC), set `VITE_ASSET_CODE` and `VITE_ASSET_ISSUER` and ensure all household members have the required trustline.

---

## Running Tests

### Frontend unit tests

```bash
cd apps/web
npm test
# Runs: money, balance, settlement optimizer, split validator, contractService
```

From the repo root, `npm test` runs both the frontend suite and the mock-server
tests (`node --test mock-server.test.mjs`).

### Frontend type-check

```bash
npm run typecheck --workspace=apps/web
```

### Frontend lint

```bash
npm run lint --workspace=apps/web
```

### Rust contract tests

```bash
cd contracts/billbuddy
cargo test --features testutils   # testutils enables the test contract harness
```

### Rust format + lint

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

### Build WASM

```bash
cargo build --target wasm32-unknown-unknown --release
```

---

## CI/CD

GitHub Actions runs on every push to `main` and every pull request.

**Jobs:**
- `frontend` — lint, typecheck, vitest, vite build
- `contract` — rustfmt, clippy, `cargo test --features testutils`, wasm build
- `mock-server` — `node --test` for the shared mock-state server
- `all-checks` — gate requiring all three jobs to pass

See `.github/workflows/ci.yml`.

**Required secrets:** none for CI checks (uses mock mode). For deployment automation, add:
- `STELLAR_DEPLOYER_SECRET` — deployer account secret key (server-side only, never in `.env`)

---

## Project Structure

```
billbuddy/
├── apps/
│   └── web/                     # React / Vite frontend
│       └── src/
│           ├── components/
│           │   ├── ui/          # Design system (button, card, dialog…)
│           │   ├── layout/      # AppLayout, TopBar, BottomNav
│           │   └── wallet/      # WalletButton
│           ├── pages/           # Route-level components
│           ├── hooks/           # useWallet, useHousehold, useBill…
│           ├── lib/             # money, balance, settlement, split
│           ├── services/        # walletService, stellarService, contractService
│           ├── stores/          # Zustand: walletStore, appStore
│           ├── types/           # All domain TypeScript types
│           ├── config/          # env.ts
│           └── test/            # Vitest unit tests
│
├── contracts/
│   └── billbuddy/               # Soroban smart contract (Rust)
│       └── src/
│           ├── lib.rs           # Contract entry point
│           ├── types.rs         # All Soroban types
│           ├── household.rs     # Household + member logic
│           ├── bills.rs         # Bill creation + validation
│           ├── balances.rs      # Net balance calculation
│           ├── settlement.rs    # Settlement state machine
│           ├── storage.rs       # Persistent storage helpers
│           ├── events.rs        # Contract event emitters
│           └── errors.rs        # ContractError enum
│       └── tests/
│           └── integration_tests.rs
│
├── docs/
│   ├── architecture.md
│   ├── contract.md
│   ├── deployment.md
│   └── demo.md
│
├── mock-server.mjs            # shared mock-state server (dev/demo mode)
├── mock-server.test.mjs       # server tests (node --test)
├── .github/workflows/ci.yml
├── .env.example
└── README.md
```

---

## Known Limitations

1. **Single-period model**: The current contract tracks one active period per household. Multi-period history requires additional contract storage.

2. **Asset**: Uses native XLM. Custom SAC (Stellar Asset Contract) token support is architected but not wired through the Soroban contract call path.

3. **Event indexing**: State sync uses 15-second polling via Horizon + Soroban RPC `getEvents`. A production app could use Stellar's event streaming or a lightweight indexer.

4. **Mode flags**: `VITE_MOCK_MODE=true` is an explicit, developer-only UI fallback. In real mode (`VITE_MOCK_MODE=false`) every mutation is a signed Soroban transaction and settlement payments move real Testnet XLM. Mock mode is never the source of truth.

5. **Mobile wallet**: Freighter is primarily a browser extension. Mobile wallet support depends on Freighter's mobile app or WalletConnect integration.

## Two-Wallet Flow (what actually happens)

1. **Wallet A** connects, creates a household. The Soroban transaction is signed in Freighter and confirms on Testnet.
2. **Wallet A** adds **Wallet B** by Stellar address → on-chain `add_member` transaction.
3. **Wallet A** creates a bill → on-chain `create_bill` transaction with shares + contributions. Balances live in the contract.
4. **Wallet B** opens the app in a different browser, connects → the app discovers the household via `get_household`/`get_members` and loads the same on-chain bills instantly. No localStorage copying.
5. **Wallet B** sees "You owe" → taps Pay → contract `create_settlement` (signed) → real XLM payment built by `stellarService`, signed by Freighter, submitted and confirmed → contract `complete_settlement` stores the transaction hash.
6. Both wallets poll the contract every 15 seconds and read Soroban contract events (`BillCreated`, `SettlementCompleted`, ...) which drive the Activity feed. No reload needed.

---

## Demo Steps

See `docs/demo.md` for the full 1-minute demo script.

**Quick version:**
1. Open the app, connect Freighter (Testnet)
2. Open Apartment 204 → see August 2026 bills
3. Add Internet $30 → 4-way split → balances update instantly
4. Go to Settlements → click **Settle with Stellar**
5. Freighter opens → sign
6. Watch the 5-step progress: Building → Signing → Submitting → Confirming → ✓
7. Real transaction hash appears with explorer link
8. Return to dashboard → outstanding = $0
9. Monthly Close → 🎉 August is settled!
