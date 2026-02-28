use crate::MAX_REASON_LEN;
use anchor_lang::prelude::*;

/// Seeds: [b"blacklist", stablecoin.key().as_ref(), address.key().as_ref()]
#[account]
#[derive(InitSpace)]
pub struct BlacklistEntry {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    #[max_len(MAX_REASON_LEN)]
    pub reason: String,
    pub blacklisted_at: i64,
    pub blacklisted_by: Pubkey,
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8usize
        .checked_add(32)
        .unwrap()
        .checked_add(32)
        .unwrap()
        .checked_add(4usize.checked_add(MAX_REASON_LEN).unwrap())
        .unwrap()
        .checked_add(8)
        .unwrap()
        .checked_add(32)
        .unwrap()
        .checked_add(1)
        .unwrap();
}
