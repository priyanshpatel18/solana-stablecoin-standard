use crate::RoleFlags;
use anchor_lang::prelude::*;

/// Seeds: [b"role", stablecoin.key().as_ref(), holder.key().as_ref()]
#[account]
#[derive(InitSpace)]
pub struct RoleAccount {
    pub stablecoin: Pubkey,
    pub holder: Pubkey,
    pub roles: RoleFlags,
    pub bump: u8,
}

impl RoleAccount {
    pub const LEN: usize = 8usize
        .checked_add(32)
        .unwrap()
        .checked_add(32)
        .unwrap()
        .checked_add(RoleFlags::LEN)
        .unwrap()
        .checked_add(1)
        .unwrap();
}