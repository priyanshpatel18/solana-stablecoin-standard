# Security Audit Report

## Summary

The solana-stablecoin-standard program is an Anchor-based implementation with generally sound architectural patterns and proper use of Anchor constraints. However, several critical design issues exist around compliance feature interactions, particularly with blacklist enforcement on minting/seizure operations and the potential for these emergency compliance functions to be blocked by transfer hooks. The supply cap validation, while functional, uses a fragile manual deserialization pattern.

## Findings

### Critical (2)

#### 1. Minting to Blacklisted Addresses Bypasses Compliance (SSS-2)

**Location:** programs/sss-1/src/instructions/mint.rs:59-61

**Description:**

In mint.rs (lines 59-61), the program explicitly allows minting tokens to blacklisted addresses in SSS-2 stablecoins, deferring blacklist enforcement to the transfer_hook. This creates a compliance violation where: (1) tokens can be minted to blacklisted addresses, (2) these tokens are locked but exist in the blockchain state, and (3) if the transfer_hook has a bug or is compromised, compliance is violated. While the comment indicates this is intentional delegation to the hook, the stablecoin program itself should enforce blacklist checks on all operations to prevent compliance gaps.

**Recommendation:**

For SSS-2 stablecoins, add an explicit blacklist check on the recipient before minting. This requires passing the recipient token account owner and blacklist entry account. Defense-in-depth: enforce at program level in addition to transfer hook.

---

#### 2. Seizure Operation Can Be Blocked by Transfer Hook (SSS-2)

**Location:** programs/sss-1/src/instructions/seize.rs:63-67, 103-133

**Description:**

In seize.rs (lines 63-67, 103-133), the seizure instruction uses invoke_transfer_checked which invokes the transfer_hook if enabled. If either the source or destination account is blacklisted, the hook may block the seizure. This defeats the purpose of the permanent_delegate authority and emergency compliance seizure, as privileged operations should not be subject to blacklist enforcement. The code acknowledges this issue in comments (lines 63-67) but does not resolve it.

**Recommendation:**

Implement a mechanism to exempt seizure operations from transfer_hook blacklist enforcement. This would require changes to the SSS transfer hook program (sss-2) to recognize privileged seizure context. Ensure source/dest are not blacklisted when invoking seize, or extend the hook to allow seizure bypass.

---

### High (3)

#### 1. Compliance Operations (Blacklist, Seize) Not Gated by Pause State

**Location:** programs/sss-1/src/instructions/blacklist.rs:71-72, seize.rs:70-71

**Description:**

In blacklist.rs (lines 71-72) and seize.rs (lines 70-71), blacklisting and seizure operations are explicitly NOT gated by the stablecoin's paused state. While the intent is to allow emergency compliance actions during operational pause, this creates a potential security issue: (1) if the program is paused due to a discovered vulnerability, attackers with blacklister/seizer roles can still conduct operations, (2) there is no documented emergency-level pause mechanism that would block all operations including compliance, and (3) a compromised role key could perform unlimited operations even during a global pause.

**Recommendation:**

Implement an emergency-level pause state separate from operational pause. Create a new StablecoinState field emergency_paused: bool. Alternatively, document the current design: operational pause blocks mint/burn only; compliance ops continue for emergencies.

---

#### 2. Supply Cap Account Uses Unsafe Manual Deserialization (UncheckedAccount)

**Location:** programs/sss-1/src/instructions/mint.rs:85-116

**Description:**

In mint.rs (lines 85-116), the supply_cap account is loaded as UncheckedAccount with manual deserialization instead of using Anchor's Account type. While the code does perform validation (PDA check, owner check, data length check, discriminator check), this pattern is fragile and error-prone. Manual deserialization reads directly from account data without full validation of the SupplyCap structure.

**Recommendation:**

Refactor to use Anchor's Account type with proper constraints. The supply_cap can be program_id when no cap (sentinel pattern). Consider Option<Account> with different account structure; current pattern documented and validated.

---

#### 3. Authority Transfer Does Not Auto-Assign Roles to New Authority

**Location:** programs/sss-1/src/instructions/transfer_authority.rs:26-28

**Description:**

In transfer_authority.rs (lines 26-28), when authority is transferred to a new account, that new account does not automatically receive any roles. This creates an operational risk where the new authority cannot execute any privileged operations until roles are manually granted.

**Recommendation:**

Document that callers MUST execute update_roles before or after transfer. See OPERATIONS.md and SECURITY.md for authority transfer procedure.

---

### Medium (4)

#### 1. Minter Quota Can Never Be Decreased

**Location:** programs/sss-1/src/instructions/update_minter.rs:37-42

**Description:**

In update_minter.rs (lines 37-42), minter quotas can only be increased or remain equal but cannot be decreased. To remove a minter entirely, use a different minter key.

**Recommendation:**

Document this behavior. Consider future revoke_minter instruction or allow quota=0 to disable minting (when minted_amount==0).

---

#### 2. Pausers and Freezers Share Freeze Authority

**Location:** programs/sss-1/src/instructions/freeze.rs:69-75

**Description:**

In freeze.rs (lines 69-75), both pausers and freezers can freeze individual token accounts. This mixes global pause and account-level freeze. A pauser might be granted is_pauser for pause/unpause but also be able to freeze accounts.

**Recommendation:**

Document the design. For separation of duties, prefer granting only is_freezer when account-level freeze is needed. Current behavior is intentional per Audits 1, 4, 5.

---

#### 3. Blacklist Entry Existence Check May Fail with Init_if_Needed

**Location:** programs/sss-1/src/instructions/blacklist.rs:24-30, 87

**Description:**

In blacklist.rs (line 87), the code checks if an address is already blacklisted by comparing self.blacklist_entry.address != Pubkey::default(). With init_if_needed, edge cases could produce inconsistent results.

**Recommendation:**

The current check works: init_if_needed loads existing account; address is set when blacklisted. Document the pattern.

---

#### 4. Missing Explicit PDA Derivation Validation in Freeze/Thaw — **FIXED**

**Location:** programs/sss-1/src/instructions/freeze.rs:11-36, 39-64

**Description:**

In freeze.rs, the role account is loaded but there is no explicit has_one constraint validating that the role account PDA matches the derived PDA. While Anchor's seed validation should prevent mismatches, adding explicit constraints improves auditability.

**Recommendation:**

Add explicit constraints: constraint = role.stablecoin == stablecoin.key(), constraint = role.holder == authority.key().

**Resolution:** Added `constraint = role.stablecoin == stablecoin.key()` and `constraint = role.holder == authority.key()` to both FreezeTokenAccount and ThawTokenAccount.

---

### Low (2)

#### 1. Magic Number for 'No Supply Cap' (u64::MAX) — **FIXED**

**Location:** programs/sss-1/src/instructions/update_supply_cap.rs:32-35

**Description:**

In update_supply_cap.rs (line 34), the convention of setting cap to u64::MAX to mean 'no cap' is a magic number pattern that could be confusing. The code states 'cap == 0 means remove cap — set to u64::MAX (effectively no limit)' but this is not immediately obvious to maintainers.

**Recommendation:**

Add named constants: NO_SUPPLY_CAP = u64::MAX, NO_SUPPLY_CAP_INDICATOR = 0.

**Resolution:** Added `NO_SUPPLY_CAP_INDICATOR` and `NO_SUPPLY_CAP` in constants.rs; updated update_supply_cap.rs and mint.rs to use them.

---

#### 2. Insufficient Documentation of SSS-1 vs SSS-2 Feature Gating — **FIXED**

**Location:** programs/sss-1/src/instructions/blacklist.rs:73-75, seize.rs:71-73

**Description:**

The program distinguishes between SSS-1 (basic operations) and SSS-2 (compliance features) using flags in StablecoinState. The feature gating logic is scattered across multiple instruction files and the exact requirements are not documented in a central location.

**Recommendation:**

Add a feature matrix table to ARCHITECTURE.md or README documenting which operations require SSS-1 vs SSS-2.

**Resolution:** Added "SSS-1 vs SSS-2 Feature Matrix" table to ARCHITECTURE.md.

---

### Informational (1)

#### 1. Lack of Event for Supply Cap Initialization — **DOCUMENTED**

**Location:** programs/sss-1/src/instructions/mint.rs:85, update_supply_cap.rs:20-26

**Description:**

When supply_cap is never set (remains as program_id sentinel in mint.rs), there is no event to indicate this state. SupplyCapUpdated is emitted when update_supply_cap is called.

**Recommendation:**

Document that "no cap" is the default; SupplyCapUpdated is emitted when cap is set or changed via update_supply_cap.

**Resolution:** Noted in ARCHITECTURE.md Security section: supply cap validation is fail-fast; "no cap" is the default state until update_supply_cap is called.

---

*AI Audits by Exo Technologies — https://ai-audits.exotechnologies.xyz*
