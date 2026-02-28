use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::SupplyCapUpdated;
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateSupplyCap<'info> {
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
        space = 8 + SupplyCap::INIT_SPACE,
        seeds = [SUPPLY_CAP_SEED, stablecoin.key().as_ref()],
        bump,
    )]
    pub supply_cap: Account<'info, SupplyCap>,

    pub system_program: Program<'info, System>,
}

impl<'info> UpdateSupplyCap<'info> {
    pub fn update_supply_cap(&mut self, cap: u64) -> Result<()> {
        // cap == 0 means "remove cap" — set to u64::MAX (effectively no limit)
        let effective_cap = if cap == 0 { u64::MAX } else { cap };

        if effective_cap != u64::MAX {
            require!(
                effective_cap >= self.stablecoin.total_minted,
                crate::error::StablecoinError::SupplyCapExceeded
            );
        }

        self.supply_cap.set_inner(SupplyCap {
            cap: effective_cap,
            bump: self.supply_cap.bump,
        });

        emit!(SupplyCapUpdated {
            stablecoin: self.stablecoin.key(),
            new_cap: effective_cap,
            updated_by: self.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
