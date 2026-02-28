use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::pubkey;

/// Official SSS-2 transfer hook program ID (sss_transfer_hook).
/// When enable_transfer_hook is true during init, transfer_hook_program must match this.
pub const SSS_TRANSFER_HOOK_PROGRAM_ID: Pubkey = pubkey!("8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc");

/// PDA seeds
pub const STABLECOIN_SEED: &[u8] = b"stablecoin";
pub const ROLE_SEED: &[u8] = b"role";
pub const MINTER_SEED: &[u8] = b"minter";
pub const BLACKLIST_SEED: &[u8] = b"blacklist";
pub const SUPPLY_CAP_SEED: &[u8] = b"supply_cap";
/// SSS-2 ExtraAccountMetaList PDA seed (matches sss_transfer_hook program)
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

/// SupplyCap account layout (manual deserialization in mint.rs)
pub const SUPPLY_CAP_DISCRIMINATOR_SIZE: usize = 8;
pub const SUPPLY_CAP_VALUE_OFFSET: usize = SUPPLY_CAP_DISCRIMINATOR_SIZE;
pub const SUPPLY_CAP_VALUE_SIZE: usize = 8;
pub const MIN_SUPPLY_CAP_DATA_LEN: usize = SUPPLY_CAP_VALUE_OFFSET
    .checked_add(SUPPLY_CAP_VALUE_SIZE)
    .unwrap();

/// Validation limits
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_REASON_LEN: usize = 100;
