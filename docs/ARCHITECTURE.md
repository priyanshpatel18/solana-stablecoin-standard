# Architecture

## Three-Layer Model

```
Layer 3 — Presets:     SSS-1 (Minimal)  |  SSS-2 (Compliant)
Layer 2 — Modules:     Compliance (transfer hook, blacklist, permanent delegate)
Layer 1 — Base SDK:    Token creation, mint/freeze authority, metadata, role PDAs
```

- **Layer 1 (Base):** PDA derivation (stablecoin, role, minter, blacklist, extra-account-metas), core instructions: initialize, mint, burn, freeze, thaw, pause, unpause, update_roles, update_minter, transfer_authority.
- **Layer 2 (Compliance):** SSS-2-only: transfer hook (extra-account-metas), blacklist add/remove, seize via permanent delegate. Gated by `enable_transfer_hook` and `enable_permanent_delegate`; instructions fail with a clear error if compliance was not enabled at init.
- **Layer 3 (Presets):** Config objects `Presets.SSS_1` and `Presets.SSS_2`; custom config via `extensions: { permanentDelegate, transferHook, defaultAccountFrozen }`.

## Data Flow

### Initialize

1. Authority creates mint keypair and calls `initialize_stablecoin` with preset or custom extensions.
2. Program creates Token-2022 mint (with optional PermanentDelegate, TransferHook, DefaultAccountState), StablecoinState PDA, and authority RoleAccount.
3. If SSS-2, client then calls the transfer-hook program to initialize the ExtraAccountMetaList PDA for the mint.

### Mint / Burn

- Mint: minter signs; program checks role and minter quota, then CPI to Token-2022 mint.
- Burn: burner signs; program checks role, then CPI to Token-2022 burn.

### Freeze / Thaw

- Authority with pauser or freezer capability calls freeze_account or thaw_account; program CPIs to Token-2022 (freeze authority = stablecoin PDA).

### SSS-2: Blacklist and Seize

- **Blacklist:** Blacklister adds/removes addresses; transfer hook checks every transfer against the blacklist PDA and denies if listed.
- **Seize:** Seizer calls seize; program uses permanent-delegate authority to transfer from a token account to a treasury account via Token-2022 transfer_checked (with hook accounts).

## Security

- **Role-based access:** Master authority, minter (with per-minter quotas), burner, pauser, freezer, blacklister (SSS-2), seizer (SSS-2). No single key controls everything.
- **Feature gating:** SSS-2 instructions (add_to_blacklist, remove_from_blacklist, seize) check `enable_permanent_delegate` and `enable_transfer_hook` and return a clear error if compliance was not enabled.
- **Immutable flags:** `enable_permanent_delegate`, `enable_transfer_hook`, `default_account_frozen` are set once at init and cannot be changed.

## Program IDs

- **SSS Token (sss-1):** `BMWu6XvhKMXitwv3FCjjm2zZGD4pXeB1KX5oiUcPxGDB`
- **Transfer Hook (sss-2):** `GtYvo8PY7hV3KWfGHs3fPDyFEHRV4t1PVw6BkYUBgctC`
