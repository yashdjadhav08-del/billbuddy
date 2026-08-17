# BillBuddy

A production-quality decentralized household expense splitting dApp built on Stellar/Soroban. Households track shared bills, calculate net balances using smart-contract logic, and settle payments with real on-chain XLM transfers.

---

## Demo Video

[![BillBuddy Demo](https://img.shields.io/badge/Demo%20Video-Watch-blue)](https://drive.google.com/file/d/1UUoQgIHksqRcVNydOCAE59FXHgLMT-_o/view?usp=sharing)

_Watch the BillBuddy demo on Google Drive:_ https://drive.google.com/file/d/1UUoQgIHksqRcVNydOCAE59FXHgLMT-_o/view?usp=sharing

---

## Deployment

<!-- Add your Vercel / Netlify URL here -->
https://your-deployment-url.example

---

## Live Contract (Stellar Testnet)

| | |
|---|---|
| **Contract ID** | `CCIR37QUJLJJNROTEVQMPH3SJ6W2VEBZNKJHMGEPDLDYVZ7JWBVQGWFL` |
| **Network** | Stellar Testnet (Test SDF Network ; September 2015) |
| **Explorer** | [View contract](https://stellar.expert/explorer/testnet/contract/CCIR37QUJLJJNROTEVQMPH3SJ6W2VEBZNKJHMGEPDLDYVZ7JWBVQGWFL) |

> The contract ID changes if you redeploy. Keep `apps/web/.env.local` in sync with your latest deployment.

---

## Features

- **Households** — Create shared spaces; the owner is added automatically as the first member
- **Members** — Add/remove members by Stellar public address (owner-only, on-chain authorization)
- **Bills** — Record shared expenses with equal, custom, or percentage splits; all amounts in stroops (bigint)
- **Balances** — Real-time on-chain calculation; net per member across all active bills and completed settlements
- **Settlements** — Two-step: `create_settlement` records intent → `complete_settlement` stores the transfer; plus `pay_settlement`, an on-chain transfer via inter-contract call to the native SAC
- **Events** — Soroban RPC event polling; all activity shown in the Activity feed
- **Freighter** — Non-custodial wallet; private keys never leave the browser extension
- **Responsive** — Mobile-first Tailwind CSS layout

---

## Architecture

```
Frontend (React/TypeScript/Vite)
  └─ Freighter API v2           — wallet signing
  └─ @stellar/stellar-sdk v16   — XDR building, Soroban RPC, Horizon
  └─ Soroban RPC                — simulate, submit, poll, events
       └─ BillBuddy Contract    — Soroban/Rust on Stellar Testnet
            └─ XLM SAC          — native token, inter-contract transfer
```

### Contract (`contracts/billbuddy/src/`)

| File | Purpose |
|---|---|
| `lib.rs` | 22 public functions: `create_household`, `add_member`, `remove_member`, `create_bill`, `update_bill`, `delete_bill`, `pay_bill`, `get_balance`, `get_all_balances`, `create_settlement`, `complete_settlement`, `pay_settlement`, `get_token_balance`, `close_period` + read functions |
| `types.rs` | Soroban `contracttype` structs: `Household`, `Member`, `Bill`, `Settlement`, `MemberShare`, `MemberContribution`, `MemberBalance` |
| `household.rs` | Household + member lifecycle logic |
| `bills.rs` | Bill creation, validation, payment, auto-settle |
| `balances.rs` | Net balance computation (conservation guaranteed) |
| `settlement.rs` | Settlement state machine + inter-contract token transfer |
| `storage.rs` | Persistent storage helpers with key composition |
| `events.rs` | `env.events().publish()` for all state changes |
| `errors.rs` | 40+ typed error codes |

**Inter-contract communication:** `pay_settlement` calls
`soroban_sdk::token::TokenClient::transfer` on the native XLM SAC contract —
a real cross-contract call that moves funds atomically with recording the
settlement. `get_token_balance` demonstrates read-only cross-contract queries.

### Frontend (`apps/web/src/`)

```
services/
  contractService.ts   — Soroban contract client (XDR building, mock-mode fallback)
  sorobanScVal.ts      — ScVal encoding/decoding helpers
  stellarService.ts    — build / submit / confirm XLM payments via Horizon
  walletService.ts     — Freighter API wrapper
  activityService.ts   — Soroban RPC event parsing for the Activity feed
  mockServerClient.ts  — shared mock-state server client (dev/demo mode)
hooks/
  useWallet.ts         — Freighter connection state, network checks
  useHousehold.ts      — household CRUD + `syncHousehold` (poll-refresh)
  useBill.ts           — bill creation / payment flows
  useSettlement.ts     — two-phase settlement + transfer + period close
  useSync.ts           — 15 s polling + visibility resync + trigger-sync
  useDiscovery.ts      — participant bill discovery across households
pages/
  Dashboard, CreateBill, BillDetails, Household, Settlement, MonthlyClose, Landing
 Stores (Zustand) — walletStore, appStore, activityStore
```

---

## Local Setup

**Prerequisites**

- Node.js 20+
- Rust stable with `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- Stellar CLI 22+
- Freighter Wallet browser extension

### Run the Frontend

```bash
git clone https://github.com/your-org/billbuddy.git
cd billbuddy
npm install --workspace=apps/web
cp .env.example apps/web/.env.local
# .env already contains the live contract ID — no changes needed for testnet
npm run dev --workspace=apps/web
# Open http://localhost:5173/
```

To develop without a deployed contract, set `VITE_MOCK_MODE=true` and run the
shared mock-state server:

```bash
node mock-server.mjs
```

Mock mode is a developer-only fallback — it is never the source of truth.

---

## Screenshots

<!-- Add screenshots here later -->

---

## Environment Variables (`apps/web/.env.local`)

```env
VITE_STELLAR_NETWORK=testnet
VITE_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_CONTRACT_ID=CCIR37QUJLJJNROTEVQMPH3SJ6W2VEBZNKJHMGEPDLDYVZ7JWBVQGWFL
VITE_ASSET_CONTRACT_ID=
VITE_ASSET_CODE=XLM
VITE_ASSET_ISSUER=
VITE_EXPLORER_BASE_URL=https://stellar.expert/explorer/testnet
VITE_MOCK_MODE=false
```

Never put secret keys in `.env`. `.env` is gitignored.

---

## Wallet Setup

1. Install [Freighter](https://www.freighter.app) browser extension
2. Create or import a wallet
3. Switch to **Testnet** in Freighter settings
4. Fund your wallet: `https://friendbot.stellar.org/?addr=YOUR_STELLAR_ADDRESS`
   (grants 10,000 XLM on Testnet)

---

## Running Tests

```bash
# Frontend (Vitest)
cd apps/web && npm test

# Contract (Soroban testutils)
cd contracts/billbuddy && cargo test --features testutils   # 39/39 pass

# TypeScript
cd apps/web && npm run typecheck

# Lint
cd apps/web && npm run lint

# Mock server
node --test mock-server.test.mjs
```

### Build WASM

```bash
cd contracts/billbuddy
cargo build --target wasm32-unknown-unknown --release
# Output: target/wasm32-unknown-unknown/release/billbuddy.wasm
```

### Build Frontend for Production

```bash
cd apps/web
npm run build
# Output: apps/web/dist/
```

---

## Contract Deployment

### 1. Install Rust WASM target

```bash
rustup target add wasm32-unknown-unknown
```

### 2. Install Stellar CLI

```bash
cargo install --locked stellar-cli --features opt
# or: brew install stellar/tap/stellar-cli
```

### 3. Build the contract

```bash
cd contracts/billbuddy
cargo build --target wasm32-unknown-unknown --release
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
curl "https://friendbot.stellar.org/?addr=$(stellar keys address deployer)"
```

### 6. Deploy (one command)

```bash
./scripts/deploy-contract.sh
```

The script builds, funds a deployer via Friendbot, deploys to Testnet, and
writes the returned contract ID into `apps/web/.env.local`. Or manually:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/billbuddy.wasm \
  --source deployer \
  --network testnet
```

---

## Settlement Flow

Settlement is a deliberate multi-step process that moves **real XLM**:

1. **`create_settlement`** — records the intent on-chain (signed Soroban tx), returns a settlement ID. Does **not** transfer XLM.
2. **Freighter XLM payment** — `stellarService.buildAndSignPayment` builds a Stellar Classic payment, signed in Freighter, submitted and confirmed on Horizon.
3. **`complete_settlement`** — stores the real transaction hash on-chain (signed Soroban tx).

Or the fully on-chain path: **`pay_settlement`** performs the XLM transfer via
`soroban_sdk::token::TokenClient::transfer` (inter-contract call to the XLM SAC)
and marks the settlement completed in a single Soroban transaction.

The UI shows a 5-step progress state machine: **Building → Signing → Submitting → Confirming → Confirmed**.

---

## Known Limitations

- Testnet only (no mainnet deployment)
- No multi-currency support (XLM only)
- No recurring expenses
- Single-period model per household (multi-period history requires more storage)
- Event indexing uses 15-second RPC polling; a production app could use Stellar event streaming or an indexer
- Mobile Freighter depends on Freighter's mobile app / WalletConnect
- Contract state is not paginated (households/bills fetched individually)

---

## Security

- No private keys in source code or `.env` files
- Freighter handles all signing client-side
- All authorization enforced by Soroban contract (`require_auth()`)
- Frontend authorization checks are UX only — never replace contract security
- `.gitignore` excludes `.env`, `dist/`, `target/`, `node_modules/`

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push / pull request:

- **Frontend** — lint → typecheck → test → build
- **Contract** — fmt → clippy (−D warnings) → test → WASM build
- **Mock server** — `node --test`
- **`all-checks`** — gate requiring all jobs to pass

Artifacts: `web-dist` and `contract-wasm` uploaded on `main`.

Required secrets: none for CI checks (uses mock mode).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Rust, Soroban SDK 20.x, `wasm32-unknown-unknown` |
| Frontend Framework | React 18, TypeScript 5.3, Vite 5 |
| UI | Radix UI, Tailwind CSS, Lucide icons |
| State | Zustand, TanStack Query, react-hot-toast |
| Wallet | Freighter API v2 |
| Blockchain SDK | `@stellar/stellar-sdk` v16 |
| Testing | Vitest (frontend), Soroban testutils (contract) |
| CI/CD | GitHub Actions |
| Deployment | Vercel / Netlify (frontend) |

---

## Demo Steps

See `docs/demo.md` for the full demo script. Quick version:

1. Open the app, connect Freighter (Testnet)
2. Open your household → see the current period's bills
3. Add a bill with a custom split → balances update instantly
4. Go to Settlements → click **Settle**
5. Freighter opens → sign each step
6. Watch the progress: Building → Signing → Submitting → Confirming → ✓
7. A real transaction hash appears with explorer link
8. Return to dashboard → outstanding = $0
9. Monthly Close → 🎉 period settled