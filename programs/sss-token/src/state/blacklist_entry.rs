use crate::MAX_REASON_LEN;
use anchor_lang::prelude::*;

/// Seeds: [b"blacklist", stablecoin.key().as_ref(), address.key().as_ref()]
#[account]
pub struct BlacklistEntry {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklisted_at: i64,
    pub blacklisted_by: Pubkey,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 32                    // address
        + (4 + MAX_REASON_LEN)  // reason
        + 8                     // blacklisted_at
        + 32                    // blacklisted_by
        + 1; // bump
}
