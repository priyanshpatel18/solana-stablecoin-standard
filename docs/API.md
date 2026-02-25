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

Optional process that subscribes to program logs (`onLogs`) for the SSS token program and POSTs each batch to a webhook with retry logic.

- **Env:** `RPC_URL`, `SSS_TOKEN_PROGRAM_ID`, `WEBHOOK_URL` (optional). Retry: `WEBHOOK_MAX_RETRIES` (default 5), `WEBHOOK_TIMEOUT_MS` (default 10000). Exponential backoff between attempts (1s, 2s, 4s, … up to 30s).
- **Payload (POST to WEBHOOK_URL):** `{ type: "program_logs", programId, signature, logs, err }`.
- **Retry:** The indexer retries failed POSTs up to `WEBHOOK_MAX_RETRIES` times with exponential backoff; only logs failure after the last attempt.

## Docker

From repo root, `docker compose up` starts both the **mint/burn API** and the **event indexer**.

```bash
# Optional: copy keypair for mint/burn
mkdir -p keys && cp ~/.config/solana/id.json keys/

# Set mint for the backend (required for mint/burn)
export MINT_ADDRESS=<your-stablecoin-mint-pubkey>

# Optional: send indexer events to backend compliance webhook (after compliance is deployed)
export WEBHOOK_URL=http://backend:3000/compliance/webhook

docker compose up --build
```

- **Backend** listens on port 3000. Health: `curl http://localhost:3000/health`.
- **Indexer** subscribes to the SSS program and POSTs each batch to `WEBHOOK_URL` (if set) with retry. No port exposed.

## Compliance / audit

The backend exposes a **compliance module** (blacklist management, sanctions screening integration point, transaction monitoring, audit trail export).

### Endpoints

- **POST /compliance/webhook**  
  Receives indexer payloads (e.g. set `WEBHOOK_URL=http://backend:3000/compliance/webhook`). Body: `{ type: "program_logs", programId, signature, logs, err }`. Responds 204. Events are stored for audit export.

- **GET /compliance/blacklist?mint=&lt;pubkey&gt;**  
  Returns `{ mint, entries: [{ address, reason?, addedAt }] }`. If `mint` is omitted, uses `MINT_ADDRESS`.

- **POST /compliance/blacklist**  
  Body: `{ mint?, address, reason? }`. Calls on-chain `add_to_blacklist` and records in audit. Requires keypair with blacklister role.

- **DELETE /compliance/blacklist/:address?mint=**  
  Removes address from blacklist on-chain and from local list. Requires blacklister role.

- **POST /compliance/screening**  
  Body: `{ address }`. Sanctions screening integration point. If `COMPLIANCE_SCREENING_URL` is set, forwards to that provider; otherwise returns stub `{ screened: true, match: false }`.

- **GET /compliance/audit-log?action=&from=&to=&mint=&format=json|csv**  
  Returns audit entries. `action`: one of `program_logs`, `blacklist_add`, `blacklist_remove`, `seize`, `mint`, `burn`, `freeze`, `thaw`. `format=csv` returns CSV with columns timestamp, type, signature, mint, address, reason, actor, amount.

### Env

- `MINT_ADDRESS` — default mint for blacklist/audit when not specified in request.
- `COMPLIANCE_SCREENING_URL` — optional URL for sanctions screening provider (POST with `{ address }`).

Audit trail format and regulatory notes: see [COMPLIANCE.md](COMPLIANCE.md).
