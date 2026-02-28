# SSS Stablecoin Admin Frontend

Example Next.js frontend for Solana Stablecoin Standard: wallet, mint status, supply, and admin actions (mint, burn, freeze, thaw, pause, blacklist, seize).

## Setup

```bash
pnpm install
```

## Environment

Create `.env.local`:

```
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_MINT=<MINT_ADDRESS>           # Optional: default mint for status/supply
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000   # Optional: backend for admin actions
NEXT_PUBLIC_API_KEY=<API_KEY>             # Optional: if backend requires X-API-Key
```

## Run

```bash
pnpm dev
```

Open http://localhost:3000

## Features

- **Wallet**: Connect/disconnect via Phantom or other Solana wallets
- **Mint**: Input mint address (or use `NEXT_PUBLIC_MINT`)
- **Status**: Name, symbol, decimals, paused, SSS-2, totals
- **Supply**: Total supply (minted − burned)
- **Actions** (when `NEXT_PUBLIC_BACKEND_URL` is set): Mint, Burn, Freeze, Thaw, Pause, Unpause; SSS-2: Blacklist add/remove, Seize

Without `NEXT_PUBLIC_BACKEND_URL`, the frontend displays read-only status and supply via SDK (no signing).
