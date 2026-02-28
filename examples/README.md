# SSS SDK Examples

Run from repo root after `pnpm install` and `pnpm run build:sdk`.

## Examples

| # | File | What it demonstrates |
|---|------|----------------------|
| 1 | [1-basic-sss1.ts](1-basic-sss1.ts) | SSS-1 create, mint, burn, load |
| 2 | [2-sss2-compliant.ts](2-sss2-compliant.ts) | SSS-2 create, roles, blacklist add |
| 3 | [3-custom-config.ts](3-custom-config.ts) | Custom extensions (no preset) |
| 4 | [4-roles-and-minters.ts](4-roles-and-minters.ts) | Load by mint, update roles and minter quota |
| 5 | [5-freeze-and-pause.ts](5-freeze-and-pause.ts) | Freeze/thaw account, pause/unpause |
| 6 | [6-authority-transfer.ts](6-authority-transfer.ts) | Transfer master authority |
| 7 | [7-mint-and-burn.ts](7-mint-and-burn.ts) | Mint and burn with minter/burner roles |
| 8 | [8-kyc-workflow.ts](8-kyc-workflow.ts) | SSS-2 default frozen, thaw, mint |
| 9 | [9-blacklist.ts](9-blacklist.ts) | Blacklist add/remove |
| 10 | [10-seize-assets.ts](10-seize-assets.ts) | Seize from source to treasury |

## Run

```bash
npx tsx examples/1-basic-sss1.ts
npx tsx examples/2-sss2-compliant.ts
npx tsx examples/3-custom-config.ts
npx tsx examples/4-roles-and-minters.ts <MINT>
npx tsx examples/5-freeze-and-pause.ts
npx tsx examples/6-authority-transfer.ts
npx tsx examples/7-mint-and-burn.ts
npx tsx examples/8-kyc-workflow.ts
npx tsx examples/9-blacklist.ts
npx tsx examples/10-seize-assets.ts
```

Set `RPC_URL` for localnet or devnet. Example 4 needs a mint whose authority is your `KEYPAIR` (default: `~/.config/solana/id.json`).
