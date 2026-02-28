use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use spl_token_2022;
use spl_token_2022::instruction as token_instruction;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::{AccountFrozen, AccountThawed};
use crate::state::*;

#[derive(Accounts)]
pub struct FreezeTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Token account to freeze
    #[account(mut)]
    pub target_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ThawTokenAccount<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Token account to thaw
    #[account(mut)]
    pub target_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> FreezeTokenAccount<'info> {
    pub fn freeze_token_account(&mut self) -> Result<()> {
        // Pauser and freezer both have freeze authority. Pausers can freeze accounts during
        // emergency pause; freezers can freeze for compliance. For separation of duties,
        // prefer granting only is_freezer when account-level freeze is needed.
        require!(
            self.role.roles.is_pauser || self.role.roles.is_freezer,
            StablecoinError::Unauthorized
        );

        // CPI: freeze_account — stablecoin PDA is the freeze authority
        let mint_key = self.mint.key();
        let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[self.stablecoin.bump]];

        invoke_signed(
            &token_instruction::freeze_account(
                &self.token_program.key(),
                &self.target_token_account.key(),
                &self.mint.key(),
                &self.stablecoin.key(),
                &[],
            )?,
            &[
                self.target_token_account.to_account_info(),
                self.mint.to_account_info(),
                self.stablecoin.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        emit!(AccountFrozen {
            stablecoin: self.stablecoin.key(),
            account: self.target_token_account.key(),
            frozen_by: self.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

impl<'info> ThawTokenAccount<'info> {
    pub fn thaw_token_account(&mut self) -> Result<()> {
        // Same as freeze: pauser or freezer (see freeze_token_account).
        require!(
            self.role.roles.is_pauser || self.role.roles.is_freezer,
            StablecoinError::Unauthorized
        );

        // CPI: thaw_account — stablecoin PDA is the freeze authority
        let mint_key = self.mint.key();
        let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[self.stablecoin.bump]];

        invoke_signed(
            &token_instruction::thaw_account(
                &self.token_program.key(),
                &self.target_token_account.key(),
                &self.mint.key(),
                &self.stablecoin.key(),
                &[],
            )?,
            &[
                self.target_token_account.to_account_info(),
                self.mint.to_account_info(),
                self.stablecoin.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        emit!(AccountThawed {
            stablecoin: self.stablecoin.key(),
            account: self.target_token_account.key(),
            thawed_by: self.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
