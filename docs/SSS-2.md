# SSS-2: Compliant Stablecoin

## Scope

SSS-2 extends SSS-1 with on-chain compliance: permanent delegate, transfer hook, default account frozen, blacklist, and seize.

## Features (SSS-1 plus)

- **Permanent delegate:** The stablecoin PDA is the permanent delegate so the program can move tokens from any account (used for seize).
- **Transfer hook:** Every transfer is checked by the hook program; the hook consults the blacklist PDAs and denies transfers from/to blacklisted addresses.
- **Default account frozen:** New token accounts are created in a frozen state; they must be explicitly thawed (e.g. after KYC) before use.
- **Blacklist:** Blacklister role can add/remove addresses with a reason; the transfer hook enforces the list on every transfer.
- **Seize:** Seizer role can move the full balance from a given token account to a treasury token account (e.g. sanctioned wallet → treasury).

## Use Cases

- Regulated stablecoins (USDC/USDT-class).
- Jurisdictions that expect on-chain blacklist enforcement and token seizure.
- Issuers that need a full audit trail and no gaps in transfer enforcement.

## Initialization

Use preset `SSS_2` or `extensions: { enablePermanentDelegate: true, enableTransferHook: true, defaultAccountFrozen: true }`. After deploy:

1. Initialize the stablecoin (mint + state + authority role).
2. Initialize the transfer hook’s ExtraAccountMetaList PDA for this mint (so Token-2022 includes the hook and blacklist accounts on every transfer).

The SDK and CLI perform step 2 automatically when creating an SSS-2 stablecoin.

## Compliance Instructions

- `add_to_blacklist(address, reason)` — Blacklister only.
- `remove_from_blacklist(address)` — Blacklister only.
- `seize(source_token_account, destination_token_account)` — Seizer only; source/dest are token account addresses.

These instructions revert with a clear error if the stablecoin was not initialized with compliance enabled (e.g. SSS-1).
