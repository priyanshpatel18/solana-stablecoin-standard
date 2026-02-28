use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::state::*;
use crate::MinterUpdated;

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        constraint = stablecoin.authority == authority.key(),
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterInfo::LEN,
        seeds = [MINTER_SEED, stablecoin.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: The minter account
    pub minter: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> UpdateMinter<'info> {
    pub fn update_minter(&mut self, quota: u64, bumps: &UpdateMinterBumps) -> Result<()> {
        // Enforce quota >= already minted. Prevents inconsistent state; quotas can only increase
        // or stay equal. To remove a minter entirely, use a different minter key.
        require!(
            quota >= self.minter_info.minted_amount,
            StablecoinError::QuotaExceeded
        );

        self.minter_info.set_inner(MinterInfo {
            stablecoin: self.stablecoin.key(),
            minter: self.minter.key(),
            quota,
            minted_amount: self.minter_info.minted_amount, // Preserve existing minted_amount (don't reset on quota update)
            bump: bumps.minter_info,
        });

        emit!(MinterUpdated {
            stablecoin: self.stablecoin.key(),
            minter: self.minter.key(),
            new_quota: quota,
            updated_by: self.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
