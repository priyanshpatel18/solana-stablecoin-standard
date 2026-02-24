use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use spl_token_2022::instruction as token_instruction;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensBurned;
use crate::state::*;

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub burner: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), burner.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    #[account(mut)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Burner's token account
    #[account(mut)]
    pub burner_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> BurnTokens<'info> {
    pub fn burn_tokens(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, StablecoinError::ZeroAmount);
        require!(!self.stablecoin.paused, StablecoinError::Paused);
        require!(self.role.roles.is_burner, StablecoinError::Unauthorized);

        // CPI: burn — burner signs as token account owner
        invoke(
            &token_instruction::burn(
                &self.token_program.key(),
                &self.burner_token_account.key(),
                &self.mint.key(),
                &self.burner.key(),
                &[],
                amount,
            )?,
            &[
                self.burner_token_account.to_account_info(),
                self.mint.to_account_info(),
                self.burner.to_account_info(),
            ],
        )?;

        // Update global stats
        self.stablecoin.total_burned = self
            .stablecoin
            .total_burned
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;

        emit!(TokensBurned {
            stablecoin: self.stablecoin.key(),
            burner: self.burner.key(),
            amount,
            total_burned: self.stablecoin.total_burned,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
