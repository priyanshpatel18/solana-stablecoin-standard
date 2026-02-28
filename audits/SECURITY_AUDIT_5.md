# Security Audit Report

## Summary

The solana-stablecoin-standard (SSS-1) program is a well-designed Anchor-based stablecoin implementation with role-based access control and SSS-2 compliance features. All findings from this audit have been resolved. There are no open critical, high, or medium issues.

## Findings

### High (2)

#### 1. Transfer Hook Program ID Hardcoded, Creating Deployment Coupling Risk

**Location:** programs/sss-1/src/constants.rs:6

**Description:**

The SSS_TRANSFER_HOOK_PROGRAM_ID is hardcoded in constants.rs to '8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc'. This constant is validated during initialize_stablecoin (when enable_transfer_hook=true) and seize operations. While the constant correctly matches the devnet deployment in DEVNET.md, the ARCHITECTURE.md documentation lists a different program ID ('GtYvo8PY7hV3KWfGHs3fPDyFEHRV4t1PVw6BkYUBgctC'), creating confusion. More critically, if anyone needs to deploy a new instance of the transfer hook program (e.g., for a new blockchain or mainnet), they will get a different program ID. To use it with SSS-1, the SSS-1 program must be recompiled with the new program ID constant and redeployed. This creates tight coupling between the two programs and operational friction.

**Recommendation:**

1. Update Documentation: Fix ARCHITECTURE.md to list the correct transfer hook program ID: '8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc'
2. Consider Program-Owned Configuration: Store transfer hook program ID in StablecoinState during initialization (future enhancement).
3. At minimum: Add prominent documentation in DEVNET.md and operational runbooks noting that changing the transfer hook program requires SSS-1 redeployment.

**Status:** FIXED (ARCHITECTURE.md updated, note in ARCHITECTURE.md about redeployment)

---

#### 2. Pauser Role Can Freeze/Thaw Accounts Without Explicit Freezer Role

**Location:** programs/sss-1/src/instructions/freeze.rs:70-71

**Description:**

In freeze.rs (lines 70-71), the freeze and thaw operations check: `self.role.roles.is_pauser || self.role.roles.is_freezer`. This means any account with the pauser role can also freeze and thaw accounts, regardless of whether they have the explicit freezer role. While this may be documented as 'for backward compatibility', it represents an unintended privilege escalation. A pauser granted access only to pause/unpause the stablecoin could also lock individual accounts.

**Recommendation:**

Remove the pauser condition from freeze/thaw checks, or document the design decision and strongly recommend separating these roles in production deployments.

**Status:** FIXED (documented in freeze.rs: pauser and freezer both have freeze authority; prefer is_freezer for separation of duties)

---

### Medium (4)

#### 1. Documentation Inconsistency: Transfer Hook Program ID Mismatch

**Location:** docs/ARCHITECTURE.md:47-48 vs programs/sss-1/src/constants.rs:6 vs docs/DEVNET.md:10

**Description:**

ARCHITECTURE.md lists the Transfer Hook program ID as 'GtYvo8PY7hV3KWfGHs3fPDyFEHRV4t1PVw6BkYUBgctC', but DEVNET.md and the actual constant in code use '8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc'. This inconsistency could confuse operators, developers, or auditors.

**Recommendation:**

Update ARCHITECTURE.md to use the correct transfer hook program ID and add a note that program IDs are deployment-specific (see DEVNET.md).

**Status:** FIXED

#### 2. Immutable SSS-2 Feature Flags Prevent Upgrade Paths

**Location:** programs/sss-1/src/state/stablecoin.rs:21-23

**Description:**

The feature flags (enable_permanent_delegate, enable_transfer_hook, default_account_frozen) are set once during initialize_stablecoin and are immutable. Once an SSS-1 token is initialized, it cannot be upgraded to SSS-2. If compliance features are needed later, a new stablecoin must be created and liquidity migrated.

**Recommendation:**

Document the immutability clearly in StablecoinState and in user-facing docs. Operators should carefully choose preset (SSS-1 vs SSS-2) at creation time.

**Status:** FIXED (documented in StablecoinState)

#### 3. Minter Quota Cannot Be Decreased Below Current Minted Amount

**Location:** programs/sss-1/src/instructions/update_minter.rs:39-41

**Description:**

The quota update validation requires `quota >= self.minter_info.minted_amount`. Quotas can only increase or stay the same. To revoke a minter, use a different minter key.

**Recommendation:**

Document this behavior. To revoke a minter: stop using their key and remove is_minter via update_roles.

**Status:** FIXED (comment in update_minter.rs)

#### 4. No Explicit Validation of Token Decimals Parameter

**Location:** programs/sss-1/src/instructions/initialize_stablecoin.rs:19

**Description:**

The initialize_stablecoin instruction accepts a decimals parameter (u8) and passes it directly to SPL Token-2022's initialize_mint2 without explicit validation. While SPL Token-2022 validates internally, there is no local validation or documentation of acceptable ranges.

**Recommendation:**

Add explicit decimals validation (e.g. `require!(params.decimals <= 18)`) or document that validation is delegated to SPL Token-2022.

**Status:** FIXED (require!(params.decimals <= 18) added in initialize_stablecoin)

---

### Low (2)

#### 1. Supply Cap Manual Deserialization Could Be Fragile

**Location:** programs/sss-1/src/instructions/mint.rs:93-107

**Description:**

The SupplyCap PDA is manually deserialized by reading raw bytes and checking the Anchor discriminator. While defensive, manual deserialization is more fragile than Anchor's account deserialization. Any future change to SupplyCap layout could break this without compile-time detection.

**Recommendation:**

Add a comment documenting WHY manual deserialization is necessary (UncheckedAccount to avoid mut constraint). Consider a unit test verifying the discriminator.

**Status:** FIXED (comment in mint.rs)

#### 2. Authority Transfer Without Pre-Granting Roles Could Cause Lockout

**Location:** programs/sss-1/src/instructions/transfer_authority.rs:26-49

**Description:**

The transfer_authority instruction does not automatically grant roles to the new authority. If the current authority transfers and loses access before calling update_roles, the new authority may have no roles and cannot perform operations until they grant themselves roles via update_roles.

**Recommendation:**

Add operational guidance in SECURITY.md and OPERATIONS.md: either (1) pre-grant roles to new authority before transfer, or (2) new authority calls update_roles after transfer. Do not lose access to the old authority key until roles are granted.

**Status:** FIXED (OPERATIONS.md and SECURITY.md updated)

---

### Informational (1)

#### 1. Blacklist Not Enforced at Mint/Burn Level

**Location:** programs/sss-1/src/instructions/mint.rs:54

**Description:**

The blacklist feature (SSS-2 only) is enforced only by the transfer hook, not by mint/burn operations. A blacklisted address cannot receive tokens via transfer (blocked by the hook), but a minter could directly mint to a blacklisted address. This is likely intentional.

**Recommendation:**

Document the design decision: blacklist enforcement for recipients is delegated to the transfer hook. Direct mint operations do not check blacklist status.

**Status:** FIXED (comment in mint.rs)

---

*AI Audits by Exo Technologies — https://ai-audits.exotechnologies.xyz/