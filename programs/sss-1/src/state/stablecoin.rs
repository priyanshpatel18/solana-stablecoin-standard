use crate::{MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_URI_LEN};
use anchor_lang::prelude::*;

/// Seeds: [b"stablecoin", mint.key().as_ref()]
#[account]
#[derive(InitSpace)]
pub struct StablecoinState {
    /// Master authority who can update roles and transfer authority
    pub authority: Pubkey,
    /// Token-2022 mint address
    pub mint: Pubkey,
    /// Token metadata
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_SYMBOL_LEN)]
    pub symbol: String,
    #[max_len(MAX_URI_LEN)]
    pub uri: String,
    pub decimals: u8,
    /// Feature flags. Immutable after init; choose SSS-1 vs SSS-2 at creation.
    /// Cannot upgrade SSS-1 to SSS-2; create new stablecoin and migrate if needed.
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
    /// Operational state
    pub paused: bool,
    pub total_minted: u64,
    pub total_burned: u64,
    /// PDA bump
    pub bump: u8,
}

impl StablecoinState {
    pub fn is_sss2(&self) -> bool {
        self.enable_permanent_delegate && self.enable_transfer_hook
    }
}
