# Solana Stablecoin Standard (SSS)

Open-source standards and SDK for stablecoins on Solana — production-ready templates that institutions and builders can fork, customize, and deploy.

## Overview

- **SSS-1 (Minimal Stablecoin):** Mint authority + freeze authority + metadata. Suited for internal tokens, DAO treasuries, ecosystem settlement.
- **SSS-2 (Compliant Stablecoin):** SSS-1 + permanent delegate + transfer hook + blacklist enforcement. For regulated, USDC/USDT-class tokens with on-chain blacklist and seizure.

## Architecture

Three layers (bounty-aligned):

```mermaid
flowchart TD
  subgraph L3["Layer 3 — Standard Presets"]
    SSS1["SSS-1 Minimal Stablecoin"]
    SSS2["SSS-2 Compliant Stablecoin"]
  end
  subgraph L2["Layer 2 — Modules"]
    COMP["Compliance: transfer hook, blacklist, permanent delegate"]
    PRIV["Privacy: confidential transfers, allowlists (future)"]
  end
  subgraph L1["Layer 1 — Base SDK"]
    BASE["Token creation, mint/freeze authority, metadata, role PDAs, CLI + TypeScript SDK"]
  end
  L3 --> L2
  L2 --> L1
```

- **Layer 1 (Base SDK):** Token creation with mint/freeze authority and metadata; issuers choose extensions. Role management program. CLI + TypeScript SDK.
- **Layer 2 (Modules):** Compliance (transfer hook, blacklist PDAs, permanent delegate). Privacy (confidential transfers, allowlists) optional/future.
- **Layer 3 (Presets):** SSS-1 (minimal) and SSS-2 (compliant) — opinionated combinations documented as standards.

## Quick Start

```bash
# Build programs and SDK
anchor build
pnpm run build:sdk

# Run tests
pnpm run test:sdk          # SDK unit tests
anchor test               # Integration tests (requires local validator)
```

### Using the TypeScript SDK

```typescript
import { Connection, Keypair } from "@solana/web3.js";
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

const program = getProgram(provider);
const loaded = await SolanaStablecoin.load(program, stable.mintAddress);
await loaded.mint(wallet.publicKey, {
  recipient: recipientPubkey,
  amount: 1_000_000n,
  minter: wallet.publicKey,
});

await stable.compliance.blacklistAdd(wallet.publicKey, addressPubkey, "Sanctions match");
await stable.compliance.seize(wallet.publicKey, sourceTokenAccount, treasuryTokenAccount);
```

### CLI

Build the CLI from repo root: `pnpm run build:sdk` then `cd packages/cli && pnpm run build` (or use `pnpm run cli` after building). All non-init commands require `-m <MINT>`.

```bash
# Init: choose preset or custom config
pnpm run cli init --preset sss-1 -n "My Token" -s TKN --uri "https://..."
pnpm run cli init --preset sss-2 -n "Regulated USD" -s RUSD --uri "https://..."
pnpm run cli init --custom config.toml -n "Custom" -s CUSD --uri "https://..."

# Operations
pnpm run cli -m <MINT> mint <RECIPIENT> <AMOUNT>
pnpm run cli -m <MINT> burn <AMOUNT>
pnpm run cli -m <MINT> freeze <ADDRESS>
pnpm run cli -m <MINT> thaw <ADDRESS>
pnpm run cli -m <MINT> pause
pnpm run cli -m <MINT> unpause
pnpm run cli -m <MINT> status
pnpm run cli -m <MINT> supply

# SSS-2 compliance
pnpm run cli -m <MINT> blacklist add <ADDRESS> --reason "OFAC match"
pnpm run cli -m <MINT> blacklist remove <ADDRESS>
pnpm run cli -m <MINT> seize <SOURCE_TOKEN_ACCOUNT> --to <TREASURY_TOKEN_ACCOUNT>

# Management
pnpm run cli -m <MINT> minters list
pnpm run cli -m <MINT> minters add <ADDRESS> --quota <AMOUNT>
pnpm run cli -m <MINT> minters remove <ADDRESS>
pnpm run cli -m <MINT> holders
pnpm run cli -m <MINT> holders --min-balance <AMOUNT>
BACKEND_URL=http://localhost:3000 pnpm run cli -m <MINT> audit-log
BACKEND_URL=http://localhost:3000 pnpm run cli -m <MINT> audit-log --action mint
```

Full operator runbook: [Operations](docs/OPERATIONS.md).

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
- `backend/` — Mint/burn API, event indexer, compliance (audit, blacklist)
- `tests/` — Integration tests
- `docs/` — Architecture, SDK, operations, standards

## Backend

The backend provides a mint/burn API, event indexer, and compliance module (audit trail, blacklist management). **Backend:** `docker compose up` or `pnpm run start:backend`; for local run without Docker use `pnpm run backend` (after `pnpm install` and building the SDK). See [API](docs/API.md) for endpoints.

**Devnet deployment proof:** Program IDs and example transactions are in [DEVNET](docs/DEVNET.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Layer model, data flows, security
- [SDK](docs/SDK.md) — Presets, custom config, TypeScript API
- [Operations](docs/OPERATIONS.md) — Operator runbook
- [SSS-1](docs/SSS-1.md) — Minimal stablecoin spec
- [SSS-2](docs/SSS-2.md) — Compliant stablecoin spec
- [Compliance](docs/COMPLIANCE.md) — Regulatory considerations, audit trail
- [API](docs/API.md) — Backend API reference
- [Devnet](docs/DEVNET.md) — Deployment and example transactions
- [Examples](examples/README.md) — Step-by-step TypeScript examples

## Verification (submission checklist)

Before submitting a PR or for local verification:

1. **Build and test**
   ```bash
   anchor build && pnpm run build:sdk && pnpm run test:sdk && anchor test
   ```
2. **Backend**
   ```bash
   docker compose up
   ```
   In another terminal: `curl http://localhost:3000/health`
3. **Devnet proof (optional)**  
   Run `anchor test --provider.cluster devnet --skip-build --skip-deploy` and refresh the example transaction table in [DEVNET](docs/DEVNET.md) with fresh Explorer links if desired.

## License

MIT
