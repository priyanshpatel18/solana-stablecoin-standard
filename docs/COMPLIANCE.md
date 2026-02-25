# Compliance

## Regulatory Considerations

- **Blacklist:** SSS-2 maintains an on-chain blacklist. Adding an address blocks all transfers involving that address (enforced by the transfer hook). Operators should align add/remove with their compliance policy and any sanctions lists (e.g. OFAC).
- **Seize:** Allows moving tokens from a designated account to a treasury without the account owner’s signature. Use only under appropriate legal authority and procedures.
- **Audit trail:** All compliance-related instructions can be tracked on-chain (blacklist add/remove, seize). Off-chain indexing and logging should capture tx IDs, signers, and reasons for audit and reporting.

## Audit Trail Format

Suggested fields for an export or API:

- **Event type:** e.g. `blacklist_add`, `blacklist_remove`, `seize`.
- **Stablecoin (mint):** Public key.
- **Actor:** Signer public key.
- **Target address:** For blacklist: the listed/unlisted address; for seize: source and destination token accounts (and derived owner addresses).
- **Reason:** For blacklist add, the on-chain reason string.
- **Amount:** For seize, the amount moved.
- **Transaction signature:** On-chain tx ID.
- **Timestamp:** Block time or indexer timestamp.

Backend services (see API.md) can expose these as structured logs or an audit-log endpoint.

## Sanctions Screening

SSS-2 does not perform sanctions screening itself. Operators should:

- Integrate with a sanctions screening provider (e.g. Chainalysis, Elliptic, or a custom list).
- Map screening results to blacklist add/remove via the CLI or SDK (or a compliance service that calls the program).
- Document the policy for when an address is added/removed and who is authorized to perform seize.

## Failure Modes

- **Compliance not enabled:** If the stablecoin was created as SSS-1, calls to blacklist or seize will fail with `ComplianceNotEnabled` (program error 6002). The SDK throws `ComplianceNotEnabledError` in that case.
- **Unauthorized:** Only the blacklister role can add/remove blacklist entries; only the seizer role can call seize. Other signers get `Unauthorized` (6000).
