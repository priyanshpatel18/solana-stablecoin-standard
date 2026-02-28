# Security Audit Report 2

## Summary

The solana-stablecoin-standard (SSS-1) program is a well-architected Anchor-based stablecoin token with role-based access control, minter quotas, and supply cap enforcement. Overall security is strong with proper PDA validation, arithmetic overflow protection, and CPI safety measures. However, there are findings that should be addressed: incomplete supply cap account validation that could allow silent bypass, inconsistent feature gating in the seize instruction, and lack of validation for the transfer hook program during initialization.

## Findings

### High (1)

#### 1. Supply Cap Enforcement Can Be Bypassed via Invalid Account

**Location:** `programs/sss-1/src/instructions/mint.rs:102-122`

**Description:**

In the mint instruction, the supply cap account validation logic is incomplete. The instruction accepts an UncheckedAccount for `supply_cap` and checks if it matches either the program ID (sentinel for no cap) or the expected PDA. However, if an incorrect account address is provided that doesn't match either of these values, the supply cap check is silently skipped without returning an error. This allows a malicious minter to bypass supply cap enforcement by providing an arbitrary account address as `supply_cap`.

**Recommendation:**

Modify the supply cap validation logic to enforce that if `supply_cap` is provided and is not the program ID, it MUST be the correct SupplyCap PDA. Change the validation from silent skipping to explicit error:

```rust
if self.supply_cap.key() != crate::ID {
    let (expected_pda, _) = Pubkey::find_program_address(
        &[SUPPLY_CAP_SEED, stablecoin_key.as_ref()],
        &crate::ID
    );
    require_eq!(
        self.supply_cap.key(),
        expected_pda,
        StablecoinError::Unauthorized
    );
    // ... rest of validation
}
```

**Status:** FIXED

---

### Medium (2)

#### 1. Incomplete Feature Gating in Seize Instruction

**Location:** `programs/sss-1/src/instructions/seize.rs:70-73`

**Description:**

The seize instruction checks only `enable_permanent_delegate` to gate SSS-2 features, but according to `is_sss2()` and the instruction's use of the transfer hook program, it should verify both `enable_permanent_delegate` AND `enable_transfer_hook` are enabled. A stablecoin with only permanent_delegate enabled (but no transfer_hook) could attempt to call seize, which may fail unexpectedly.

**Recommendation:**

Update the feature gate check to use `is_sss2()`:

```rust
require!(
    self.stablecoin.is_sss2(),
    StablecoinError::ComplianceNotEnabled
);
```

**Status:** FIXED

#### 2. Transfer Hook Program Not Validated During Initialization

**Location:** `programs/sss-1/src/instructions/initialize_stablecoin.rs:54,142-150`

**Description:**

When `enable_transfer_hook` is true, the `transfer_hook_program` parameter is used directly without validation that it matches the expected SSS-2 transfer hook program. An authority could specify an incorrect transfer hook program, resulting in a stablecoin that executes arbitrary code during token transfers.

**Recommendation:**

Add validation: when `enable_transfer_hook` is true, require `transfer_hook_program.key() == SSS_TRANSFER_HOOK_PROGRAM_ID`.

**Status:** FIXED

---

### Low (1)

#### 1. Authority Transfer Does Not Require New Authority Signature

**Location:** `programs/sss-1/src/instructions/transfer_authority.rs:20-36`

**Description:**

The transfer_authority instruction allows the current authority to transfer authority to any address without requiring that address to sign. This creates a risk where authority could be accidentally transferred to an incompatible address.

**Recommendation:**

Document this design clearly in user documentation. A two-step process (propose + accept) could be considered for future versions.

**Status:** DOCUMENTED

---

### Informational (1)

#### 1. Manual Deserialization of SupplyCap Account Data

**Location:** `programs/sss-1/src/instructions/mint.rs:111-117`

**Description:**

The supply cap validation manually deserializes the SupplyCap account by reading raw bytes instead of using proper Account deserialization. Manual byte reading at fixed offsets `[8..16]` assumes the struct layout remains constant.

**Recommendation:**

Add named constants for the struct layout offsets and document the assumptions:

```rust
const SUPPLY_CAP_DISCRIMINATOR_SIZE: usize = 8;
const SUPPLY_CAP_VALUE_OFFSET: usize = SUPPLY_CAP_DISCRIMINATOR_SIZE;
const SUPPLY_CAP_VALUE_SIZE: usize = 8;
const MIN_SUPPLY_CAP_DATA_LEN: usize = SUPPLY_CAP_VALUE_OFFSET + SUPPLY_CAP_VALUE_SIZE;
```

**Status:** FIXED
