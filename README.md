# Solana Stablecoin Standard (SSS)

Open-source standards and SDK for stablecoins on Solana — production-ready templates that institutions and builders can fork, customize, and deploy.

## Overview

- **SSS-1 (Minimal Stablecoin):** Mint authority + freeze authority + metadata. Suited for internal tokens, DAO treasuries, ecosystem settlement.
- **SSS-2 (Compliant Stablecoin):** SSS-1 + permanent delegate + transfer hook + blacklist enforcement. For regulated, USDC/USDT-class tokens with on-chain blacklist and seizure.

## Quick Start

```bash
# Build programs and SDK
anchor build
npm run build:sdk

# Run tests
npm run test:sdk          # SDK unit tests
anchor test               # Integration tests (requires local validator)
```

### Using the TypeScript SDK

```typescript
import { Connection } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { SolanaStablecoin, Presets, getProgram } from "@stbr/sss-token";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = Keypair.fromSecretKey(/* ... */);
const provider = new AnchorProvider(connection, new Wallet(wallet), {});

// Create SSS-2 stablecoin
const stable = await SolanaStablecoin.create(connection, {
  preset: "SSS_2",
  name: "My USD",
  symbol: "MYUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
}, wallet);
console.log("Mint:", stable.mintAddress.toBase58());

// Or load existing
const program = getProgram(provider);
const loaded = await SolanaStablecoin.load(program, stable.mintAddress);
await loaded.mint(wallet.publicKey, {
  recipient: recipientPubkey,
  amount: 1_000_000n,
  minter: wallet.publicKey,
});
```

### CLI

```bash
# From repo root (build CLI first: cd packages/cli && npm run build)
node packages/cli/dist/index.js init --preset sss-2 -n "My USD" -s MYUSD --uri "https://..."
node packages/cli/dist/index.js -m <MINT> status
node packages/cli/dist/index.js -m <MINT> mint <RECIPIENT> <AMOUNT>
node packages/cli/dist/index.js -m <MINT> blacklist add <ADDRESS> --reason "OFAC match"
```

## Preset Comparison

| Feature                    | SSS-1 | SSS-2 |
|---------------------------|-------|-------|
| Mint / burn / freeze      | Yes   | Yes   |
| Metadata                  | Yes   | Yes   |
| Permanent delegate        | No    | Yes   |
| Transfer hook (blacklist) | No    | Yes   |
| Default account frozen    | No    | Yes   |
| Blacklist / seize         | No    | Yes   |

## Repository Layout

- `programs/sss-1` — Anchor program (core + SSS-2 compliance instructions)
- `programs/sss-2` — Transfer hook program (Token-2022)
- `sdk/core` — TypeScript SDK (`@stbr/sss-token`)
- `packages/cli` — Admin CLI (`sss-token`)
- `tests/` — Integration tests
- `docs/` — Architecture, SDK, operations, standards

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Layer model, data flows, security
- [SDK](docs/SDK.md) — Presets, custom config, TypeScript API
- [Operations](docs/OPERATIONS.md) — Operator runbook
- [SSS-1](docs/SSS-1.md) — Minimal stablecoin spec
- [SSS-2](docs/SSS-2.md) — Compliant stablecoin spec
- [Compliance](docs/COMPLIANCE.md) — Regulatory considerations, audit trail
- [API](docs/API.md) — Backend API reference
- [Devnet](docs/DEVNET.md) — Deployment and example transactions

## License

MIT
