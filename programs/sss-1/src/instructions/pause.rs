use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{StablecoinPaused, StablecoinUnpaused};
use crate::state::*;

#[derive(Accounts)]
pub struct PauseUnpause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,
}

impl<'info> PauseUnpause<'info> {
    pub fn pause(&mut self) -> Result<()> {
        require!(self.role.roles.is_pauser, StablecoinError::Unauthorized);

        self.stablecoin.paused = true;

        emit!(StablecoinPaused {
            stablecoin: self.stablecoin.key(),
            paused_by: self.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn unpause(&mut self) -> Result<()> {
        require!(self.role.roles.is_pauser, StablecoinError::Unauthorized);

        self.stablecoin.paused = false;

        emit!(StablecoinUnpaused {
            stablecoin: self.stablecoin.key(),
            unpaused_by: self.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
