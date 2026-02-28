# Security Audit Report

## Summary

The solana-stablecoin-standard (SSS-1) program is a well-architected Anchor-based stablecoin token with role-based access control, minter quotas, and supply cap enforcement. All findings from this audit have been resolved. There are no open critical, high, or medium issues.

## Findings

### High (1)

#### 1. Supply Cap Enforcement Can Be Bypassed via Invalid Account

**Location:** programs/sss-1/src/instructions/mint.rs:102-122

**Description:**

In the mint instruction, the supply cap account validation logic is incomplete. The instruction accepts an UncheckedAccount for supply_cap and checks if it matches either the program ID (sentinel for no cap) or the expected PDA. However, if an incorrect account address is provided that doesn't match either of these values, the supply cap check is silently skipped without returning an error. This allows a malicious minter to bypass supply cap enforcement by providing an arbitrary account address as supply_cap. The current logic on lines 102-122 should fail with an error if the supplied account is neither the program ID nor the correct PDA, rather than silently skipping validation.

**Recommendation:**

Modify the supply cap validation logic to enforce that if supply_cap is provided and is not the program ID, it MUST be the correct SupplyCap PDA. Change the validation from silent skipping to explicit error:

```rust
if self.supply_cap.key() != crate::ID {
    let (expected_pda, _) = Pubkey::find_program_address(
        &[SUPPLY_CAP_SEED, stablecoin_key.as_ref()],
        &crate::ID
    );
    // MUST match expected PDA or be the program ID
    require_eq!(
        self.supply_cap.key(),
        expected_pda,
        StablecoinError::Unauthorized  // or add new error
    );
    require_eq!(
        self.supply_cap.owner,
        &crate::ID,
        StablecoinError::Unauthorized
    );
    // ... rest of validation
}
```

**Status:** FIXED

---

### Medium (2)

#### 1. Incomplete Feature Gating in Seize Instruction

**Location:** programs/sss-1/src/instructions/seize.rs:70-73

**Description:**

The seize instruction checks only enable_permanent_delegate to gate SSS-2 features, but according to the is_sss2() definition and the instruction's use of the transfer hook program, it should verify both enable_permanent_delegate AND enable_transfer_hook are enabled. The inline comment at line 69 explicitly states 'only SSS-2 tokens support seizure', but the code does not enforce this. A stablecoin token with only permanent_delegate enabled (but no transfer_hook) could attempt to call seize, which may fail unexpectedly or cause inconsistent behavior. The blacklist add/remove instructions correctly use is_sss2() for this check.

**Recommendation:**

Update the feature gate check to require both extensions:

```rust
require!(
    self.stablecoin.is_sss2(),  // Check both permanent_delegate AND transfer_hook
    StablecoinError::ComplianceNotEnabled
);
```

This ensures consistency with the blacklist enforcement instructions and prevents seize from being called on incomplete SSS-2 implementations.

**Status:** FIXED

#### 2. Transfer Hook Program Not Validated During Initialization

**Location:** programs/sss-1/src/instructions/initialize_stablecoin.rs:54,142-150

**Description:**

In the initialize_stablecoin instruction, when enable_transfer_hook is true, the transfer_hook_program parameter is used directly without any validation that it matches the expected transfer hook program (SSS-2). The parameter is marked as /// CHECK with no constraints, and is passed directly to Token-2022's initialize function. While only the authority (mint signer) can call initialize_stablecoin, an authority could accidentally or maliciously specify an incorrect transfer hook program, resulting in a stablecoin that executes arbitrary code during token transfers. The transfer_hook_program should either be constrained to a known trusted program ID or require explicit validation.

**Recommendation:**

Add validation for the transfer_hook_program. If using a single official transfer hook program, constrain it:

```rust
/// Transfer hook program (must be the official SSS-2 transfer hook)
#[account(address = TRANSFER_HOOK_PROGRAM_ID)]  // Define as constant
pub transfer_hook_program: AccountInfo<'info>,
```

Alternatively, require the transfer hook program to sign the transaction:

```rust
pub transfer_hook_program: Signer<'info>,
```

Or document this clearly in the API and client SDK so users understand they must verify the transfer hook program ID matches the official SSS-2 program.

**Status:** FIXED (validated in initialize_stablecoin)

---

### Low (1)

#### 1. Authority Transfer Does Not Require New Authority Signature

**Location:** programs/sss-1/src/instructions/transfer_authority.rs:20-36

**Description:**

The transfer_authority instruction allows the current authority to transfer authority to any address without requiring that address to sign the transaction. While this may be intentional for programmatic or multisig use cases, it creates a risk where authority could be accidentally transferred to an incompatible address, an address the new authority doesn't control, or an address that cannot sign transactions. The new authority would then need to execute additional setup (calling update_roles) before they can exercise their authority, which requires them to pay for account creation.

**Recommendation:**

Consider implementing a two-step authority transfer process for critical security: (1) propose_transfer_authority (current authority proposes new authority), and (2) accept_authority (new authority must sign to accept). This is a design decision; if single-step transfer is required, document this clearly in user documentation and consider adding a constraint that the new_authority is at least a valid Pubkey (which is already done on lines 26-32).

**Status:** FIXED (documented in OPERATIONS.md and SECURITY.md)

---

### Informational (1)

#### 1. Manual Deserialization of SupplyCap Account Data

**Location:** programs/sss-1/src/instructions/mint.rs:111-117

**Description:**

The supply cap validation in mint.rs manually deserializes the SupplyCap account by reading raw bytes (lines 111-117) instead of using proper Account deserialization. While the code includes validation checks (length check, owner check, PDA check), this approach is fragile and could break if the SupplyCap struct changes. Manual byte reading at fixed offsets [8..16] assumes the struct layout remains constant.

**Recommendation:**

Consider using a proper Account type instead of manual deserialization. However, UncheckedAccount is used to avoid making supply_cap writable, so alternatives are: (1) Use a readonly Account<'info, SupplyCap> constraint (requires updating the account handling), or (2) if keeping UncheckedAccount, add a comment documenting the struct layout assumptions and consider using named constants for the offsets:

```rust
const SUPPLY_CAP_DISCRIMINATOR_SIZE: usize = 8;
const SUPPLY_CAP_VALUE_OFFSET: usize = SUPPLY_CAP_DISCRIMINATOR_SIZE;
const SUPPLY_CAP_VALUE_SIZE: usize = 8;
const MIN_SUPPLY_CAP_DATA_LEN: usize = SUPPLY_CAP_VALUE_OFFSET + SUPPLY_CAP_VALUE_SIZE;
```

**Status:** FIXED (constants + discriminator verification)

---

*AI Audits by Exo Technologies — https://ai-audits.exotechnologies.xyz
