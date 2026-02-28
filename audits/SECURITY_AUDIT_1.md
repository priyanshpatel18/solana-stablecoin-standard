# Security Audit Report 1

## Summary

The solana-stablecoin-standard program implements an Anchor-based stablecoin system with role-based access control and Token-2022 integration. While the core architecture is sound with proper PDA validation and CPI protections, there are critical issues with supply cap validation, unsafe data access patterns, and missing quota validations that could lead to inconsistent state or panics.

## Findings

### Critical (1)

#### 1. Unsafe supply cap account data parsing with potential panic

**Location:** `programs/sss-1/src/instructions/mint.rs:102-112`

**Description:**

In the mint instruction, the supply cap amount is read from raw bytes using hardcoded offsets without proper validation. The code accesses `cap_data[8..16]` and uses `.unwrap()` on the slice conversion, which will panic if the account data is malformed or too small. While PDA derivation provides some protection, explicit validation is missing.

**Recommendation:**

Add explicit account data size and owner validation before parsing:

```rust
// After try_borrow_data
let cap_data = self.supply_cap.try_borrow_data()?;
require!(cap_data.len() >= 16, StablecoinError::MathOverflow);
require_eq!(self.supply_cap.owner, &crate::ID);
let cap = u64::from_le_bytes(
    cap_data[8..16].try_into()
        .map_err(|_| StablecoinError::MathOverflow)?
);
```

Alternatively, deserialize the SupplyCap account properly using Anchor's deserialization instead of raw byte access.

**Status:** FIXED

---

### High (2)

#### 1. UpdateMinter allows setting quota below current minted amount

**Location:** `programs/sss-1/src/instructions/update_minter.rs:35-42`

**Description:**

The update_minter instruction does not validate that the new quota is >= the current `minted_amount`. This allows the authority to set a quota below what has already been minted, creating an inconsistent state where the invariant `minted_amount <= quota` is violated.

**Recommendation:**

Add validation to ensure the new quota does not drop below the current minted amount:

```rust
require!(
    quota >= self.minter_info.minted_amount,
    StablecoinError::QuotaExceeded
);
```

**Status:** FIXED

#### 2. Incorrect bump value stored in newly created MinterInfo accounts

**Location:** `programs/sss-1/src/instructions/update_minter.rs:35-42`

**Description:**

When update_minter creates a new MinterInfo account via `init_if_needed`, it preserves the default bump value (0) instead of setting the correct PDA bump.

**Recommendation:**

Pass `ctx.bumps` to the handler and use `bumps.minter_info` when setting the inner struct.

**Status:** FIXED

---

### Medium (3)

#### 1. Semantically incorrect role usage for freeze/thaw operations

**Location:** `programs/sss-1/src/instructions/freeze.rs:69,104`

**Description:**

The freeze_account and thaw_account instructions require the `is_pauser` role instead of a dedicated freezer role. While this works functionally, it couples two distinct operations (pausing and freezing) under the same permission.

**Recommendation:**

Add a new `is_freezer` role to the RoleFlags struct for better separation of concerns, with backward compatibility (`is_pauser || is_freezer`).

**Status:** FIXED

#### 2. Seize operation potentially blocked by transfer hooks on blacklisted accounts

**Location:** `programs/sss-1/src/instructions/seize.rs:62-122`

**Description:**

The seize instruction uses the transfer hook mechanism. If either the source or destination is blacklisted, the transfer hook could block the seizure operation.

**Recommendation:**

Document this behavior clearly in code comments. If seizures should respect blacklists, document explicitly.

**Status:** FIXED (documented)

#### 3. Missing validation of supply cap account owner

**Location:** `programs/sss-1/src/instructions/mint.rs:46-49,102-112`

**Description:**

The supply_cap account is declared as UncheckedAccount with no explicit check that it is owned by this program.

**Recommendation:**

Add `require_eq!(self.supply_cap.owner, &crate::ID, StablecoinError::Unauthorized)` before parsing.

**Status:** FIXED

---

### Low (1)

#### 1. Transfer authority lacks validation checks

**Location:** `programs/sss-1/src/instructions/transfer_authority.rs:24-26`

**Description:**

The transfer_authority instruction does not validate that the new authority is not the zero address or that it differs from the current authority.

**Recommendation:**

Add validation for zero address and same-as-current authority.

**Status:** FIXED

---

### Informational (1)

#### 1. Blacklist already-exists error uses generic Anchor error instead of custom error code

**Location:** `programs/sss-1/src/instructions/blacklist.rs:24-30`

**Description:**

When attempting to add an address that's already blacklisted, the init constraint fails with a generic "account already exists" error rather than `AlreadyBlacklisted`.

**Recommendation:**

Use `init_if_needed` with a custom check that returns `StablecoinError::AlreadyBlacklisted` when the account already exists.

**Status:** FIXED
