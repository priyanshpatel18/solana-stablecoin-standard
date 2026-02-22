use anchor_lang::prelude::*;

/// Seeds: [b"minter", stablecoin.key().as_ref(), minter.key().as_ref()]
#[account]
pub struct MinterInfo {
    pub stablecoin: Pubkey,
    pub minter: Pubkey,
    /// Maximum amount this minter is allowed to mint
    pub quota: u64,
    /// Running total of tokens minted by this minter
    pub minted_amount: u64,
    pub bump: u8,
}

impl MinterInfo {
    pub const LEN: usize = 8   // discriminator
        + 32                    // stablecoin
        + 32                    // minter
        + 8                     // quota
        + 8                     // minted_amount
        + 1; // bump
}
