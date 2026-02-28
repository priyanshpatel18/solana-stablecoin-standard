use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::AuthorityTransferred;
use crate::state::*;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    /// CHECK: The new authority. Does not require signer to allow programmatic/multisig
    /// handoff and cold storage transfers. Caller must ensure address is correct.
    pub new_authority: AccountInfo<'info>,
}

impl<'info> TransferAuthority<'info> {
    pub fn transfer_authority(&mut self) -> Result<()> {
        // NOTE: New authority does not auto-receive roles. Authority must call update_roles
        // for the new authority before or after transfer; or use a two-tx flow.
        require!(
            self.new_authority.key() != Pubkey::default(),
            StablecoinError::Unauthorized
        );
        require!(
            self.new_authority.key() != self.stablecoin.authority,
            StablecoinError::InvalidRoleConfig
        );

        let previous_authority = self.stablecoin.authority;
        self.stablecoin.authority = self.new_authority.key();

        emit!(AuthorityTransferred {
            stablecoin: self.stablecoin.key(),
            previous_authority,
            new_authority: self.new_authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
