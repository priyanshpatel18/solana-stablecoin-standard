# Compliance

## Regulatory Considerations

- **Blacklist:** SSS-2 maintains an on-chain blacklist. Adding an address blocks all transfers involving that address (enforced by the transfer hook). Operators should align add/remove with their compliance policy and any sanctions lists (e.g. OFAC).
- **Seize:** Allows moving tokens from a designated account to a treasury without the account owner’s signature. Use only under appropriate legal authority and procedures.
- **Audit trail:** All compliance-related instructions can be tracked on-chain (blacklist add/remove, seize). Off-chain indexing and logging should capture tx IDs, signers, and reasons for audit and reporting.

## Audit Trail Format

The backend compliance module (see [API.md](API.md)) exposes `GET /compliance/audit-log` and stores events from the indexer webhook and from API calls (mint, burn, blacklist add/remove). Export format (JSON or CSV) includes:

- **timestamp** — ISO 8601.
- **type** — `program_logs`, `blacklist_add`, `blacklist_remove`, `seize`, `mint`, `burn`, `freeze`, `thaw`.
- **signature** — On-chain transaction signature when applicable.
- **mint** — Stablecoin mint public key.
- **address** — Target address (e.g. blacklisted address, recipient, burner).
- **reason** — For blacklist add, the on-chain reason string.
- **actor** — Signer public key.
- **amount** — For mint/burn/seize, the amount.

Use query params `action`, `from`, `to`, `mint`, and `format=json|csv` to filter and export.

## Sanctions Screening Integration Point

The backend provides **POST /compliance/screening** with body `{ address }`. This is the integration point for an external sanctions screening provider (e.g. Chainalysis, Elliptic, Scorechain). Set `COMPLIANCE_SCREENING_URL` to the provider’s endpoint; the backend forwards the request and returns the provider’s response. If unset, the endpoint returns a stub `{ screened: true, match: false }`. Operators should:

- Integrate with a sanctions screening provider (e.g. Chainalysis, Elliptic, or a custom list).
- Map screening results to blacklist add/remove via the CLI or SDK (or a compliance service that calls the program).
- Document the policy for when an address is added/removed and who is authorized to perform seize.

## Failure Modes

- **Compliance not enabled:** If the stablecoin was created as SSS-1, calls to blacklist or seize will fail with `ComplianceNotEnabled` (program error 6002). The SDK throws `ComplianceNotEnabledError` in that case.
- **Unauthorized:** Only the blacklister role can add/remove blacklist entries; only the seizer role can call seize. Other signers get `Unauthorized` (6000).
