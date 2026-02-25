# Backend API Reference

Backend services for the Solana Stablecoin Standard: mint/burn API and optional indexer/webhook.

## Mint/Burn Service

HTTP server (default port 3000). Environment: `RPC_URL`, `KEYPAIR_PATH`, `MINT_ADDRESS`, `PORT`.

### Endpoints

- **GET /health**  
  Returns `{ status: "ok", rpc, mint }`. No auth.

- **POST /mint-request**  
  Request mint. Body (JSON): `{ "recipient": "<pubkey>", "amount": "<number or string>", "minter": "<pubkey> (optional)" }`.  
  If `minter` is omitted, the keypair at `KEYPAIR_PATH` is used as minter.  
  Returns `{ success: true, signature: "<tx sig>" }` or `{ error: "<message>" }` with status 400/500.

- **POST /burn-request**  
  Request burn. Body (JSON): `{ "amount": "<number or string>", "burner": "<pubkey> (optional)" }`.  
  If `burner` is omitted, the keypair at `KEYPAIR_PATH` is used.  
  Returns `{ success: true, signature: "<tx sig>" }` or `{ error: "<message>" }` with status 400/500.

### Fiat-to-stablecoin flow

1. Off-chain: verify the user (KYC, limits, etc.).
2. Call `POST /mint-request` with recipient and amount.
3. Log the returned signature and any metadata for audit.
4. For redeem: verify and call `POST /burn-request` with amount (and optionally burner).

## Event indexer

Optional process that subscribes to program logs (`onLogs`) for the SSS token program and can POST each batch to a webhook.

- **Env:** `RPC_URL`, `SSS_TOKEN_PROGRAM_ID`, `WEBHOOK_URL` (optional).
- **Payload (POST to WEBHOOK_URL):** `{ type: "program_logs", programId, signature, logs, err }`.
- **Retry:** Implement retry/backoff in your webhook consumer; the indexer does not retry.

## Docker

From repo root:

```bash
# Optional: copy keypair for mint/burn
mkdir -p keys && cp ~/.config/solana/id.json keys/

# Set mint for the backend (required for mint/burn)
export MINT_ADDRESS=<your-stablecoin-mint-pubkey>

docker compose up --build
```

Backend listens on port 3000. Health: `curl http://localhost:3000/health`.

## Compliance / audit

Use the indexer webhook or your own log ingestion to build an audit trail (see [COMPLIANCE.md](COMPLIANCE.md)). Filter by `signature` and parse `logs` for program events (e.g. mint, burn, blacklist add, seize).
