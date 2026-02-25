# Devnet Deployment

## Program IDs

Deployed on Devnet (Anchor.toml and program `declare_id!`):

- **SSS Token (sss-1):** `BMWu6XvhKMXitwv3FCjjm2zZGD4pXeB1KX5oiUcPxGDB`
- **Transfer Hook (sss-2):** `GtYvo8PY7hV3KWfGHs3fPDyFEHRV4t1PVw6BkYUBgctC`

## Deploy

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Use the same program IDs in Anchor.toml for devnet so the SDK and CLI work without change.

## Example transactions

After deploying and creating a stablecoin:

1. **Initialize (SSS-1 or SSS-2)** — From CLI: `sss-token init --preset sss-1 -n "Test" -s TST --uri "https://example.com"`. Or use the TypeScript SDK `SolanaStablecoin.create(connection, { preset: "SSS_1", ... }, keypair)`.
2. **Mint** — `sss-token -m <MINT> mint <RECIPIENT> 1000000`.
3. **Status** — `sss-token -m <MINT> status`.
4. **Supply** — `sss-token -m <MINT> supply`.

Example Solana Explorer links (replace `<SIG>` and `<MINT>` with actual values):

- Transaction: `https://explorer.solana.com/tx/<SIG>?cluster=devnet`
- Mint account: `https://explorer.solana.com/address/<MINT>?cluster=devnet`

## Proof of deployment

- Build and test: `anchor build && npm run build:sdk && npm run test:sdk && anchor test` (integration tests require a running validator).
- CLI: `node packages/cli/dist/index.js --help`.
- Backend: `cd backend && npm run build && npm start` then `curl http://localhost:3000/health`.
