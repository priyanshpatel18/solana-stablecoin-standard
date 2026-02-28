# Security Audit Report

## Summary

The solana-stablecoin-standard program is an Anchor-based Solana stablecoin implementation with Token-2022 integration and role-based access control. The program demonstrates solid architectural design with proper use of PDAs and Anchor constraints. However, there are several security and operational concerns including missing signer validation on authority transfers, insufficient event logging for state changes, and potential account misidentification in manually-deserialized structures.

## Findings

### High (2)

#### 1. Missing Signer Validation on Authority Transfer

**Location:** src/programs/sss-1/src/instructions/transfer_authority.rs:21

**Description:**

The transfer_authority instruction accepts a new_authority account without requiring it to be a signer. While basic validation checks prevent transferring to Pubkey::default() or the current authority, there is no validation that the new authority account is capable of signing transactions. This could allow an attacker or careless user to transfer authority to an invalid address, effectively bricking the stablecoin until authority is recovered through other means.

**Recommendation:**

Add a Signer constraint to the new_authority account to ensure it can sign transactions:

```rust
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    // Change from AccountInfo to Signer
    pub new_authority: Signer<'info>,
}
```

#### 2. Supply Cap Manual Deserialization Without Discriminator Verification

**Location:** src/programs/sss-1/src/instructions/mint.rs:92-105

**Description:**

The mint instruction manually deserializes the supply cap account by reading bytes starting at offset 8 (skipping the 8-byte Anchor discriminator) to extract the cap value. While the code validates that the account is the correct PDA and owned by the program, it does not verify the account's discriminator. An attacker could theoretically create account data that passes the existing checks but contains incorrect cap values, potentially allowing mints beyond the intended supply cap. This violates defense-in-depth principles for account validation.

**Recommendation:**

Add explicit discriminator verification before reading the cap value:

```rust
let cap_data = self.supply_cap.try_borrow_data()?;
require!(
    cap_data.len() >= MIN_SUPPLY_CAP_DATA_LEN,
    StablecoinError::MathOverflow
);

// Verify Anchor discriminator
let expected_discriminator = anchor_lang::utils::sha256::hash(b"account:SupplyCap");
let actual_discriminator = &cap_data[0..8];
require_eq!(
    actual_discriminator,
    &expected_discriminator[0..8],
    StablecoinError::Unauthorized
);

// Now safely read the cap value
let cap = u64::from_le_bytes(
    cap_data[SUPPLY_CAP_VALUE_OFFSET..MIN_SUPPLY_CAP_DATA_LEN]
        .try_into()
        .map_err(|_| StablecoinError::MathOverflow)?,
);
```

---

### Medium (4)

#### 1. Missing Event Emission on Supply Cap Update

**Location:** src/programs/sss-1/src/instructions/update_supply_cap.rs:30-48

**Description:**

The update_supply_cap instruction modifies critical stablecoin parameters (the maximum total supply cap) but does not emit an event. All other state-modifying instructions (mint, burn, pause, update_roles, update_minter, transfer_authority, blacklist operations, seize) emit events for audit trail purposes. This inconsistency creates gaps in the audit log and makes it difficult to track supply cap changes during forensic analysis.

**Recommendation:**

Add an event emission after the supply cap is updated:

```rust
// First, define the event in events.rs:
#[event]
pub struct SupplyCapUpdated {
    pub stablecoin: Pubkey,
    pub new_cap: u64,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

// Then emit it in the instruction handler:
pub fn update_supply_cap(&mut self, cap: u64) -> Result<()> {
    let effective_cap = if cap == 0 { u64::MAX } else { cap };

    if effective_cap != u64::MAX {
        require!(
            effective_cap >= self.stablecoin.total_minted,
            crate::error::StablecoinError::SupplyCapExceeded
        );
    }

    let previous_cap = self.supply_cap.cap;
    self.supply_cap.set_inner(SupplyCap {
        cap: effective_cap,
        bump: self.supply_cap.bump,
    });

    emit!(SupplyCapUpdated {
        stablecoin: self.stablecoin.key(),
        new_cap: effective_cap,
        updated_by: self.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
```

#### 2. Compliance Operations Not Paused During Stablecoin Pause

**Location:** src/programs/sss-1/src/instructions/blacklist.rs:68-107 and src/programs/sss-1/src/instructions/seize.rs:62-144

**Description:**

The pause/unpause instructions restrict minting and burning operations when the stablecoin is paused. However, blacklist management (add_to_blacklist, remove_from_blacklist) and seizure operations are not subject to the pause check. This creates inconsistent behavior where operational transactions are halted but compliance operations continue. While this might be intentional (allowing emergency compliance actions), it's not clearly documented and could lead to unexpected behavior during an operational pause.

**Recommendation:**

Add explicit pause checks to blacklist and seize operations if pausing should prevent these operations:

```rust
// In blacklist.rs:
pub fn add_to_blacklist(&mut self, reason: String, bumps: AddToBlacklistBumps) -> Result<()> {
    require!(
        !self.stablecoin.paused,
        StablecoinError::Paused
    );
    // ... rest of implementation
}

pub fn remove_from_blacklist(&mut self) -> Result<()> {
    require!(
        !self.stablecoin.paused,
        StablecoinError::Paused
    );
    // ... rest of implementation
}
```

Alternatively, document why these operations should continue during pause and add explanatory comments to the code.

#### 3. Tokens Can Be Minted to Blacklisted Accounts

**Location:** src/programs/sss-1/src/instructions/mint.rs:53-143

**Description:**

The mint_tokens instruction does not validate whether the recipient token account owner is blacklisted. For SSS-2 stablecoins with transfer hooks, tokens sent to a blacklisted account after minting would be locked in place since transfers are blocked by the hook. This effectively traps tokens in blacklisted accounts, creating dead supply that cannot be recovered except through seizure operations. Additionally, the minting of tokens that cannot be transferred violates the principle that all minted tokens should be freely transferable (subject to compliance rules).

**Recommendation:**

For SSS-2 stablecoins, validate that the recipient is not blacklisted before minting:

```rust
pub fn mint_tokens(&mut self, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(!self.stablecoin.paused, StablecoinError::Paused);
    require!(self.role.roles.is_minter, StablecoinError::Unauthorized);

    // For SSS-2 tokens, validate recipient is not blacklisted
    if self.stablecoin.is_sss2() {
        // Check if recipient_token_account owner is blacklisted
        // This requires additional account validation
        // NOTE: Recipient is a token account, need to extract owner from token account data
    }

    // ... rest of implementation
}
```

Note: This requires changes to account structure to receive the token account owner and blacklist entry accounts.

#### 4. New Authority Not Automatically Granted Roles After Transfer

**Location:** src/programs/sss-1/src/instructions/transfer_authority.rs:24-46

**Description:**

The transfer_authority instruction transfers the master authority field of the stablecoin but does not automatically grant the new authority any roles. Since role-based access control is required for all privileged operations (mint, burn, freeze, pause, etc.), the new authority would be locked out of performing any operations until someone with existing authority explicitly grants them roles via update_roles. This creates a critical operational risk where authority transfer could result in a locked-out administrator.

**Recommendation:**

Update the transfer_authority instruction to automatically grant all roles to the new authority:

```rust
pub fn transfer_authority(&mut self, ctx: &Context<TransferAuthority>) -> Result<()> {
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

    // Automatically grant all roles to new authority if role account exists
    // This requires additional context accounts for the new authority's role account

    emit!(AuthorityTransferred {
        stablecoin: self.stablecoin.key(),
        previous_authority,
        new_authority: self.new_authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
```

Alternatively, document the requirement that the new authority must be set up with roles before authority transfer.

---

### Low (2)

#### 1. Missing Validation of Holder Address in Role Assignment

**Location:** src/programs/sss-1/src/instructions/update_roles.rs:34-57

**Description:**

The update_roles instruction accepts a holder account without validating that it is not the zero address (Pubkey::default()). While assigning roles to the zero address is operationally useless, it wastes blockchain storage and could be used to create misleading audit trails. The code should validate that only real addresses receive role assignments.

**Recommendation:**

Add a validation check to prevent assigning roles to the zero address:

```rust
pub fn update_roles(&mut self, roles: RoleFlags) -> Result<()> {
    require!(
        self.holder.key() != Pubkey::default(),
        StablecoinError::InvalidRoleConfig
    );

    self.role.set_inner(RoleAccount {
        stablecoin: self.stablecoin.key(),
        holder: self.holder.key(),
        roles,
        bump: self.role.bump,
    });

    emit!(RolesUpdated {
        stablecoin: self.stablecoin.key(),
        holder: self.holder.key(),
        is_minter: roles.is_minter,
        is_burner: roles.is_burner,
        is_pauser: roles.is_pauser,
        is_freezer: roles.is_freezer,
        is_blacklister: roles.is_blacklister,
        is_seizer: roles.is_seizer,
        updated_by: self.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
```

#### 2. Potential Account Misidentification via Manual Deserialization

**Location:** src/programs/sss-1/src/instructions/mint.rs:92-101

**Description:**

While the code properly validates the supply cap account PDA, owner, and data length, relying on manual deserialization (reading specific byte offsets) rather than using Anchor's deserialization mechanisms creates risk. If the account layout changes or if there are any subtle bugs in the offset calculations, it could lead to reading incorrect data. The current implementation reads from offset 8 (after discriminator) to get the cap value, but this pattern is brittle.

**Recommendation:**

Consider using a wrapper function or Anchor's account deserialization. Add discriminator verification (see High 2) as defense-in-depth.

---

### Informational (2)

#### 1. Pauser and Freezer Roles Have Overlapping Permissions

**Location:** src/programs/sss-1/src/instructions/freeze.rs:68-110

**Description:**

The freeze_token_account and thaw_token_account instructions allow accounts with either the is_pauser OR is_freezer role to perform account freezing/thawing. This overlap might be intentional for convenience, but it creates a scenario where pausers have more capabilities than their name suggests. An account with only the pauser role can freeze individual accounts, which is a compliance operation that might be better restricted to dedicated freezers.

**Recommendation:**

Document the intentional overlap and rationale in the code:

```rust
// Pauser and Freezer both have authority to freeze/thaw accounts.
// Pausers can freeze all accounts as part of an emergency pause,
// while Freezers can freeze specific accounts for compliance.
require!(
    self.role.roles.is_pauser || self.role.roles.is_freezer,
    StablecoinError::Unauthorized
);
```

#### 2. No Constraints on Role Combinations

**Location:** src/programs/sss-1/src/instructions/update_roles.rs:34-57

**Description:**

The role assignment system allows any combination of the 6 roles (minter, burner, pauser, freezer, blacklister, seizer) to be assigned to an account. While this provides flexibility, it doesn't enforce any security principles like separation of duties. An account could simultaneously be a minter and a blacklister, which could create conflicts of interest in a real-world stablecoin deployment.

**Recommendation:**

Document this design choice. Deployers should implement separation of duties at the organizational level.

---

*AI Audits by Exo Technologies — https://ai-audits.exotechnologies.xyz
