#!/usr/bin/env bash
# Deploy the BillBuddy Soroban contract to Stellar Testnet.
#
# Requires:
#   - stellar-cli (https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
#   - The contract WASM already built:
#       cd contracts/billbuddy && cargo build --target wasm32-unknown-unknown --release
#
# Usage:
#   ./scripts/deploy-contract.sh [deployer-key-name]
#   default deployer key name: billbuddy-deployer
set -euo pipefail

NETWORK="testnet"
KEY_NAME="${1:-billbuddy-deployer}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
WASM="$DIR/contracts/billbuddy/target/wasm32-unknown-unknown/release/billbuddy.wasm"

if [ ! -f "$WASM" ]; then
  echo "ERROR: contract WASM not found at $WASM" >&2
  echo "Build it first: cd contracts/billbuddy && cargo build --target wasm32-unknown-unknown --release" >&2
  exit 1
fi

echo "> Ensuring testnet network config..."
stellar network add "$NETWORK" \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" >/dev/null 2>&1 || true

echo "> Ensuring deployer key ($KEY_NAME)..."
if ! stellar keys list 2>/dev/null | grep -q "$KEY_NAME"; then
  stellar keys generate "$KEY_NAME" --network "$NETWORK"
fi

ADDRESS="$(stellar keys address "$KEY_NAME")"
echo "> Deployer address: $ADDRESS"

# Fund via Friendbot (only affects existing balance; harmless if already funded)
echo "> Funding deployer via Friendbot (testnet)..."
curl -s "https://friendbot.stellar.org/?addr=${ADDRESS}" >/dev/null || true

echo "> Deploying contract..."
CONTRACT_ID="$(stellar contract deploy \
  --wasm "$WASM" \
  --source "$KEY_NAME" \
  --network "$NETWORK")"

echo ""
echo ">>> Contract deployed: $CONTRACT_ID"
echo ">>> Add this to apps/web/.env.local:"
echo "    VITE_SOROBAN_CONTRACT_ID=$CONTRACT_ID"

# Helpfully patch .env.local if that file exists.
ENV_LOCAL="$DIR/apps/web/.env.local"
if [ -f "$ENV_LOCAL" ]; then
  if grep -q '^VITE_SOROBAN_CONTRACT_ID=' "$ENV_LOCAL"; then
    sed -i.bak "s|^VITE_SOROBAN_CONTRACT_ID=.*|VITE_SOROBAN_CONTRACT_ID=$CONTRACT_ID|" "$ENV_LOCAL"
    rm -f "$ENV_LOCAL.bak"
    echo "> Updated VITE_SOROBAN_CONTRACT_ID in apps/web/.env.local"
  fi
fi

echo "> Done."