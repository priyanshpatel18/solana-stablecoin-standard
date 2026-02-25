# Operations Runbook

Operator guide for mint, freeze, thaw, pause, blacklist, and seize using the CLI or SDK.

## Prerequisites

- Keypair with the required role (authority, minter, burner, pauser, blacklister, seizer).
- For CLI: `--mint <MINT>` for all commands except `init`. Optionally `--keypair`, `--rpc-url`, or env `KEYPAIR`, `RPC_URL`.

## Mint

**CLI:**

```bash
sss-token -m <MINT> mint <RECIPIENT_PUBKEY> <AMOUNT>
```

**SDK:**

```typescript
await stable.mint(signerPubkey, {
  recipient: recipientPubkey,
  amount: BigInt(amount),
  minter: signerPubkey,
});
```

The signer must have the minter role and sufficient minter quota.

## Burn

**CLI:**

```bash
sss-token -m <MINT> burn <AMOUNT>
```

**SDK:**

```typescript
await stable.burn(signerPubkey, { amount: BigInt(amount) });
```

The signer must have the burner role; tokens are burned from the signer’s token account.

## Freeze / Thaw

**CLI:**

```bash
sss-token -m <MINT> freeze <OWNER_PUBKEY>   # freeze token account of owner
sss-token -m <MINT> thaw <OWNER_PUBKEY>
```

**SDK:**

```typescript
const targetAta = stable.getRecipientTokenAccount(ownerPubkey);
await stable.freezeAccount(signerPubkey, targetAta);
await stable.thawAccount(signerPubkey, targetAta);
```

The signer must have the pauser role.

## Pause / Unpause

**CLI:**

```bash
sss-token -m <MINT> pause
sss-token -m <MINT> unpause
```

**SDK:**

```typescript
await stable.pause(signerPubkey);
await stable.unpause(signerPubkey);
```

The signer must have the pauser role. When paused, transfers are blocked by the program.

## Blacklist (SSS-2 only)

**CLI:**

```bash
sss-token -m <MINT> blacklist add <ADDRESS> --reason "OFAC match"
sss-token -m <MINT> blacklist remove <ADDRESS>
```

**SDK:**

```typescript
await stable.compliance.blacklistAdd(signerPubkey, addressPubkey, "OFAC match");
await stable.compliance.blacklistRemove(signerPubkey, addressPubkey);
```

The signer must have the blacklister role. Adding an address blocks all transfers from/to that address while the transfer hook is active.

## Seize (SSS-2 only)

**CLI:**

```bash
sss-token -m <MINT> seize <SOURCE_TOKEN_ACCOUNT> --to <TREASURY_TOKEN_ACCOUNT>
```

**SDK:**

```typescript
await stable.compliance.seize(
  signerPubkey,
  sourceTokenAccountPubkey,
  destinationTokenAccountPubkey
);
```

The signer must have the seizer role. Source and destination are token account addresses (e.g. ATAs). Full balance of the source account is transferred to the destination (treasury).

## Status and Supply

**CLI:**

```bash
sss-token -m <MINT> status   # name, symbol, decimals, paused, SSS-2, totals
sss-token -m <MINT> supply   # total supply (minted - burned)
```

**SDK:**

```typescript
const state = await stable.getState();
const supply = await stable.getTotalSupply();
```

## Role and Minter Management

- **Update roles:** Use SDK `updateRoles(signer, { holder, roles })` (authority only).
- **Update minter quota:** Use SDK `updateMinter(signer, { minter, quota })` (authority only).
- **Transfer authority:** Use SDK `transferAuthority(signer, newAuthority)` (authority only).

CLI commands for `minters list/add/remove` and `holders` can be added on top of the SDK; they are not implemented in the minimal CLI.
