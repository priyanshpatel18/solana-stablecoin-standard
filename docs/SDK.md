# SDK Reference

## Installation

From the repo:

```bash
cd sdk/core && npm install && npm run build
```

In your app, depend on the local package: `"@stbr/sss-token": "file:path/to/solana-stablecoin-standard/sdk/core"`.

## Presets and Custom Config

- **Presets:** `Presets.SSS_1` (minimal), `Presets.SSS_2` (compliant). Use in `CreateStablecoinParams.preset`.
- **Custom:** Omit `preset` and set `extensions: { enablePermanentDelegate?, enableTransferHook?, defaultAccountFrozen? }`.

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(connection, {
  preset: "SSS_2",
  name: "My Stablecoin",
  symbol: "MYUSD",
  uri: "https://...",
  decimals: 6,
}, authorityKeypair);

const custom = await SolanaStablecoin.create(connection, {
  name: "Custom",
  symbol: "CUSD",
  uri: "https://...",
  decimals: 6,
  extensions: { enablePermanentDelegate: true, enableTransferHook: false },
}, authorityKeypair);

await stable.compliance.blacklistAdd(blacklisterPubkey, addressPubkey, "Sanctions match");
await stable.compliance.seize(seizerPubkey, sourceTokenAccount, destinationTokenAccount);
const supply = await stable.getTotalSupply();
```

## Main Class: SolanaStablecoin

### Create and Load

- `SolanaStablecoin.create(connection, params, signer)` — Create new stablecoin (mint + state + roles; SSS-2 also inits transfer hook PDA). Requires keypair for authority.
- `SolanaStablecoin.load(program, mint)` — Load by mint. Use `getProgram(provider)` to build `program`.

### State and View

- `getState()` — Cached stablecoin state (authority, mint, name, symbol, decimals, paused, total_minted, total_burned, flags).
- `refresh()` — Reload state from chain.
- `getTotalSupply()` — total_minted - total_burned.
- `isSSS2()` — True if both permanent delegate and transfer hook are enabled.
- `getRecipientTokenAccount(owner)` — Associated token account for the mint (Token-2022).

### Core Operations (all presets)

- `mint(signer, { recipient, amount, minter })` — Mint to recipient (minter must have role and quota).
- `burn(signer, { amount })` — Burn from signer’s ATA (burner role).
- `freezeAccount(signer, targetTokenAccount)` — Freeze account (pauser role).
- `thawAccount(signer, targetTokenAccount)` — Thaw account (pauser role).
- `pause(signer)` / `unpause(signer)` — Pause/unpause (pauser role).
- `updateRoles(signer, { holder, roles })` — Set role flags for a holder (authority).
- `updateMinter(signer, { minter, quota })` — Set minter quota (authority).
- `transferAuthority(signer, newAuthority)` — Transfer master authority (authority).

### Compliance (SSS-2 only)

- `compliance.blacklistAdd(signer, address, reason)` — Add to blacklist (blacklister role).
- `compliance.blacklistRemove(signer, address)` — Remove from blacklist (blacklister role).
- `compliance.seize(signer, sourceTokenAccount, destinationTokenAccount)` — Seize tokens to treasury (seizer role). Source/dest are token account addresses; owner is read from chain for blacklist PDAs.

Calls to compliance methods on a non-SSS-2 stablecoin throw `ComplianceNotEnabledError`.

## PDA Helpers

From `@stbr/sss-token`:

- `findStablecoinPDA(mint [, programId])`
- `findRolePDA(stablecoin, holder [, programId])`
- `findMinterPDA(stablecoin, minter [, programId])`
- `findBlacklistPDA(stablecoin, address [, programId])`
- `findExtraAccountMetasPDA(mint, hookProgramId)`

## Errors

- `ComplianceNotEnabledError` — Compliance used on non-SSS-2.
- `StablecoinErrorCode` — Program error codes (e.g. Unauthorized 6000, Paused 6001, ComplianceNotEnabled 6002).
- `parseAnchorErrorCode(logs)` — Extract program error code from tx logs.

## Types

- `CreateStablecoinParams`, `StablecoinState`, `MintParams`, `BurnParams`, `UpdateRolesParams`, `UpdateMinterParams`, `RoleFlags`, `Presets`.
