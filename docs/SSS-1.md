# SSS-1: Minimal Stablecoin

## Scope

SSS-1 is the minimal stablecoin standard: what’s needed on every stablecoin and nothing more.

## Features

- **Token-2022 mint** with metadata (name, symbol, URI, decimals).
- **Mint authority** and **freeze authority** held by the program’s stablecoin PDA (not a single EOA).
- **Role-based access:** master authority, minters (with per-minter quotas), burners, pausers. No blacklist or seizure.
- **Operations:** initialize, mint, burn, freeze/thaw, pause/unpause, update_roles, update_minter, transfer_authority.

## What SSS-1 Does Not Include

- No permanent delegate.
- No transfer hook.
- No default-account-frozen (new accounts are not frozen by default).
- No blacklist or seize.

## Use Cases

- Internal settlement tokens.
- DAO treasuries.
- Ecosystem or partner stablecoins where compliance is handled off-chain (e.g. freeze accounts as needed).

## Initialization

Use preset `SSS_1` or `extensions: { enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false }`. After init, the stablecoin cannot be upgraded to SSS-2 (flags are immutable).
