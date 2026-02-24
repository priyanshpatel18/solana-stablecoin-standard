use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Transfer denied: address is blacklisted")]
    Blacklisted,
    #[msg("Transfer denied: stablecoin is paused")]
    Paused,
    #[msg("Invalid instruction discriminator for transfer hook")]
    InvalidInstruction,
}
