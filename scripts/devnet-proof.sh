#!/usr/bin/env bash
# Devnet proof script: run init + mint and print Solana Explorer links.
# Requires: anchor build, npm run build:sdk, CLI built (npm run build in packages/cli)
# Env: RPC_URL (default https://api.devnet.solana.com), KEYPAIR_PATH (default ~/.config/solana/id.json)

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
KEYPAIR_PATH="${KEYPAIR_PATH:-$HOME/.config/solana/id.json}"
CLI="node packages/cli/dist/index.js"

echo "=== SSS Devnet proof ==="
echo "RPC: $RPC_URL"
echo ""

# Ensure CLI is built
if [ ! -f packages/cli/dist/index.js ]; then
  echo "Building CLI..."
  npm run build:sdk
  (cd packages/cli && npm run build)
fi

# Init SSS-1
echo ">> Initializing stablecoin (SSS-1)..."
OUTPUT_INIT=$($CLI init --preset sss-1 -n "DevnetProof" -s DVP --uri "https://example.com" -u "$RPC_URL" -k "$KEYPAIR_PATH" 2>&1) || true
echo "$OUTPUT_INIT"
MINT=$(echo "$OUTPUT_INIT" | grep -oE "Mint: [A-Za-z0-9]+" | head -1 | sed 's/Mint: //')
if [ -z "$MINT" ]; then
  echo "Could not parse mint from init output. Run init manually and set MINT_ADDRESS for mint step."
else
  echo ""
  echo "Mint address: $MINT"
  echo "Mint Explorer: https://explorer.solana.com/address/${MINT}?cluster=devnet"
  echo ""

  # Mint (recipient = self for simplicity)
  RECIPIENT=$(solana address -k "$KEYPAIR_PATH" 2>/dev/null || echo "")
  if [ -n "$RECIPIENT" ]; then
    echo ">> Minting to $RECIPIENT..."
    OUTPUT_MINT=$($CLI -m "$MINT" mint "$RECIPIENT" 1000000 -u "$RPC_URL" -k "$KEYPAIR_PATH" 2>&1) || true
    echo "$OUTPUT_MINT"
    SIG=$(echo "$OUTPUT_MINT" | grep -oE "Mint tx: [A-Za-z0-9]+" | head -1 | sed 's/Mint tx: //')
    if [ -n "$SIG" ]; then
      echo ""
      echo "Mint tx: $SIG"
      echo "Tx Explorer: https://explorer.solana.com/tx/${SIG}?cluster=devnet"
    fi
  else
    echo "Run mint manually: $CLI -m $MINT mint <RECIPIENT> 1000000 -u $RPC_URL -k $KEYPAIR_PATH"
  fi
fi

echo ""
echo "=== Proof: paste the Explorer links above into your submission ==="
