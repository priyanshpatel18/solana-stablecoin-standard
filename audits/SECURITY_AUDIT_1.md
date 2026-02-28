# Security Audit Report

## Summary

The solana-stablecoin-standard program implements an Anchor-based stablecoin system with role-based access control and Token-2022 integration. All findings from this audit have been resolved. There are no open critical, high, or medium issues.

## Findings

### Critical (1)

#### 1. Unsafe supply cap account data parsing with potential panic

**Location:** src/programs/sss-1/src/instructions/mint.rs:102-112

**Description:**

In the mint instruction, the supply cap amount is read from raw bytes using hardcoded offsets without proper validation. The code accesses cap_data[8..16] and uses .unwrap() on the slice conversion, which will panic if the account data is malformed or too small. While PDA derivation provides some protection, explicit validation is missing.

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

**Location:** src/programs/sss-1/src/instructions/update_minter.rs:35-42

**Description:**

The update_minter instruction does not validate that the new quota is >= the current minted_amount. This allows the authority to set a quota below what has already been minted, creating an inconsistent state where the invariant minted_amount <= quota is violated. While the mint instruction will prevent further minting due to the quota check, this creates invalid on-chain state.

**Recommendation:**

Add validation to ensure the new quota does not drop below the current minted amount:

```rust
pub fn update_minter(&mut self, quota: u64) -> Result<()> {
    require!(
        quota >= self.minter_info.minted_amount,
        StablecoinError::QuotaExceeded
    );

    self.minter_info.set_inner(MinterInfo {
        stablecoin: self.stablecoin.key(),
        minter: self.minter.key(),
        quota,
        minted_amount: self.minter_info.minted_amount,
        bump: self.minter_info.bump,
    });
    // ...
}
```

**Status:** FIXED

#### 2. Incorrect bump value stored in newly created MinterInfo accounts

**Location:** src/programs/sss-1/src/instructions/update_minter.rs:35-42

**Description:**

When update_minter creates a new MinterInfo account via init_if_needed, it preserves the default bump value (0) instead of setting the correct PDA bump. While this doesn't cause immediate issues since bump is not currently used for signing, it creates incorrect state that could cause problems if the code is extended to use the minter bump for future operations.

**Recommendation:**

The instruction needs access to the bumps to set the correct value for newly created accounts. Update the instruction to receive bumps and use the correct bump value:

```rust
// In lib.rs instruction handler:
pub fn update_minter(ctx: Context<UpdateMinter>, quota: u64) -> Result<()> {
    ctx.accounts.update_minter(quota, ctx.bumps)
}

// In update_minter.rs:
pub fn update_minter(&mut self, quota: u64, bumps: UpdateMinterBumps) -> Result<()> {
    // For new accounts, use bumps.minter_info; for existing, preserve existing
    let bump = if self.minter_info.minter == Pubkey::default() {
        bumps.minter_info
    } else {
        self.minter_info.bump
    };

    self.minter_info.set_inner(MinterInfo {
        stablecoin: self.stablecoin.key(),
        minter: self.minter.key(),
        quota,
        minted_amount: self.minter_info.minted_amount,
        bump,
    });
    // ...
}
```

**Status:** FIXED

---

### Medium (3)

#### 1. Semantically incorrect role usage for freeze/thaw operations

**Location:** src/programs/sss-1/src/instructions/freeze.rs:69,104

**Description:**

The freeze_account and thaw_account instructions require the is_pauser role instead of a dedicated freezer role. While this works functionally, it couples two distinct operations (pausing and freezing) under the same permission, making it impossible to grant freezing permissions without also allowing pause/unpause operations.

**Recommendation:**

Consider one of these approaches:

1. Add a new is_freezer role to the RoleFlags struct for better separation of concerns
2. Rename the existing is_pauser to is_freezer_pauser to clarify its dual purpose
3. Document explicitly that is_pauser also grants freezing privileges

Example of adding a new role:

```rust
// In enums.rs
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace)]
pub struct RoleFlags {
pub is_minter: bool,
pub is_burner: bool,
pub is_pauser: bool,
pub is_freezer: bool, // New role
pub is_blacklister: bool,
pub is_seizer: bool,
}
```

**Status:** FIXED (documented: is_pauser and is_freezer both grant freeze/thaw)

#### 2. Seize operation potentially blocked by transfer hooks on blacklisted accounts

**Location:** src/programs/sss-1/src/instructions/seize.rs:62-122

**Description:**

The seize instruction uses the transfer hook mechanism and passes blacklist account PDAs to invoke_transfer_checked. If either the source or destination is blacklisted, the transfer hook could block the seizure operation. This may be unintended since seizures should typically bypass normal restrictions.

**Recommendation:**

Clarify the intended behavior of seizures regarding blacklist enforcement. If seizures should always succeed regardless of blacklist status:

- Document this behavior clearly in code comments
- Consider implementing direct token transfer using permanent delegate rather than relying on transfer hooks
- Add integration tests verifying seizure behavior with blacklisted accounts

If seizures should respect blacklists, document that explicitly and ensure transfer hooks are properly configured.

**Status:** FIXED (documented in seize.rs)

#### 3. Missing validation of supply cap account owner

**Location:** src/programs/sss-1/src/instructions/mint.rs:46-49,102-112

**Description:**

The supply_cap account in the mint instruction is declared as UncheckedAccount and the code only verifies it matches the expected PDA. There is no explicit check that the account is owned by this program, relying entirely on PDA derivation for validation.

**Recommendation:**

Add explicit owner validation:

```rust
if self.supply_cap.key() == expected_pda {
    require_eq!(
        self.supply_cap.owner,
        &crate::ID,
        StablecoinError::Unauthorized
    );
    let cap_data = self.supply_cap.try_borrow_data()?;
    // ... rest of validation
}
```

**Status:** FIXED

---

### Low (1)

#### 1. Transfer authority lacks validation checks

**Location:** src/programs/sss-1/src/instructions/transfer_authority.rs:24-26

**Description:**

The transfer_authority instruction does not validate that the new authority address is not the zero address (Pubkey::default()) or that it differs from the current authority. While the former is unlikely in practice, the latter could cause confusion.

**Recommendation:**

Add basic validation:

```rust
pub fn transfer_authority(&mut self) -> Result<()> {
    require!(
        self.new_authority.key() != Pubkey::default(),
        StablecoinError::Unauthorized
    );
    require!(
        self.new_authority.key() != self.stablecoin.authority,
        StablecoinError::InvalidRoleConfig
    );

    let previous_authority = self.stablecoin.authority;
    self.stablecoin.authority = self.new_authority.key();
    // ...
}
```

**Status:** FIXED

---

### Informational (1)

#### 1. Blacklist already-exists error uses generic Anchor error instead of custom error code

**Location:** src/programs/sss-1/src/instructions/blacklist.rs:24-30

**Description:**

When attempting to add an address that's already blacklisted, the init constraint on the blacklist_entry account will fail with a generic 'account already exists' error rather than the custom AlreadyBlacklisted error code defined in the error module.

**Recommendation:**

Consider using init_if_needed with a custom check for better UX:

```rust
#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    // ...
    #[account(
        init_if_needed,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, stablecoin.key().as_ref(), address.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    // ...
}

// In the handler:
pub fn add_to_blacklist(&mut self, reason: String, bumps: AddToBlacklistBumps) -> Result<()> {
    require!(
        self.stablecoin.is_sss2(),
        StablecoinError::ComplianceNotEnabled
    );
    require!(
        self.role.roles.is_blacklister,
        StablecoinError::Unauthorized
    );

    // Check if already blacklisted
    if self.blacklist_entry.address != Pubkey::default() {
        return Err(StablecoinError::AlreadyBlacklisted.into());
    }
    // ...
}
```

**Status:** FIXED (init_if_needed + AlreadyBlacklisted check)

---

*AI Audits by Exo Technologies — https://ai-audits.exotechnologies.xyz