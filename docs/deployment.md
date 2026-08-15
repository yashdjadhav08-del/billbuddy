# Deployment Guide

## Contract deployment (Testnet)

### Step 1 — Install toolchain

```bash
rustup target add wasm32-unknown-unknown
cargo install --locked stellar-cli --features opt
```

### Step 2 — Configure network

```bash
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

### Step 3 — Create deployer identity

```bash
stellar keys generate deployer --network testnet
stellar keys address deployer   # copy this address
```

Fund via Friendbot:
```bash
curl "https://friendbot.stellar.org/?addr=$(stellar keys address deployer)"
```

### Step 4 — Build WASM

```bash
cd contracts/billbuddy
cargo build --target wasm32-unknown-unknown --release
```

The Soroban validator rejects the overlong LEB encodings newer rustc emits, so
canonicalize the module with wasm-opt before deploying:

```bash
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/billbuddy.wasm \
  --wasm-out target/wasm32-unknown-unknown/release/billbuddy.optimized.wasm
```

### Step 5 — Deploy

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/billbuddy.optimized.wasm \
  --source deployer \
  --network testnet
```

Copy the printed contract ID (starts with `C`).

### Step 6 — Configure frontend

```bash
# apps/web/.env.local
VITE_SOROBAN_CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_MOCK_MODE=false
```

## Frontend deployment (Vercel / Netlify / static)

### Build

```bash
cd apps/web
npm run build
# Output: dist/
```

### Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Set environment variables in the Vercel dashboard matching `.env.example`.

### Deploy to Netlify

```bash
netlify deploy --dir=apps/web/dist --prod
```

## GitHub Secrets (for CD automation)

| Secret | Used for |
|---|---|
| `STELLAR_DEPLOYER_SECRET` | Automated contract re-deployment (never expose in frontend) |
| `VERCEL_TOKEN` | Automated frontend deployment |

**Never commit secret keys.** The `.gitignore` excludes `.env.local` and `.env`.

## Re-deploying the contract

The contract is not upgradeable in the current implementation. To redeploy:
1. Build a new WASM
2. Deploy to a new contract ID
3. Update `VITE_SOROBAN_CONTRACT_ID`
4. Rebuild and redeploy the frontend

## Verifying deployment

```bash
# Invoke a read-only method
stellar contract invoke \
  --id $CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- get_household --household_id 1
```
