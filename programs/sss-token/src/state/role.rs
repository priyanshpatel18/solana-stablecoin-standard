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