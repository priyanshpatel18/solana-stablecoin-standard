use anchor_lang::prelude::*;

/// Seeds: [b"supply_cap", stablecoin.key().as_ref()]
#[account]
#[derive(InitSpace)]
pub struct SupplyCap {
    /// Maximum total supply (total_minted must not exceed this)
    pub cap: u64,
    /// PDA bump
    pub bump: u8,
}
