use crate::RoleFlags;
use anchor_lang::prelude::*;

/// Seeds: [b"role", stablecoin.key().as_ref(), holder.key().as_ref()]
#[account]
pub struct RoleAccount {
    pub stablecoin: Pubkey,
    pub holder: Pubkey,
    pub roles: RoleFlags,
    pub bump: u8,
}

impl RoleAccount {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 32                    // holder
        + RoleFlags::LEN        // roles
        + 1;                    // bump
}