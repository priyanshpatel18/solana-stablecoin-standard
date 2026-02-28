use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use spl_token_2022::instruction as token_instruction;

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensMinted;
use crate::state::*;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub minter: Signer<'info>,

    #[account(
        mut,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        mut,
        seeds = [MINTER_SEED, stablecoin.key().as_ref(), minter.key().as_ref()],
        bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    /// CHECK: Token-2022 mint
    #[account(mut)]
    pub mint: AccountInfo<'info>,

    /// CHECK: Recipient token account
    #[account(mut)]
    pub recipient_token_account: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,

    /// Optional: Supply cap PDA. Pass program_id if no cap is set (read-only sentinel).
    /// CHECK: When not program_id, must be the SupplyCap PDA for this stablecoin.
    /// Using UncheckedAccount to avoid mut constraint (program_id cannot be writable).
    pub supply_cap: UncheckedAccount<'info>,
}

impl<'info> MintTokens<'info> {
    pub fn mint_tokens(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, StablecoinError::ZeroAmount);
        require!(!self.stablecoin.paused, StablecoinError::Paused);
        require!(self.role.roles.is_minter, StablecoinError::Unauthorized);

        // Enforce per-minter quota
        let minter_info = &mut self.minter_info;
        let new_minted = minter_info
            .minted_amount
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;
        require!(
            new_minted <= minter_info.quota,
            StablecoinError::QuotaExceeded
        );

        // CPI: mint_to via stablecoin PDA (mint authority)
        let mint_key = self.mint.key();
        let signer_seeds: &[&[u8]] = &[STABLECOIN_SEED, mint_key.as_ref(), &[self.stablecoin.bump]];

        invoke_signed(
            &token_instruction::mint_to(
                &self.token_program.key(),
                &self.mint.key(),
                &self.recipient_token_account.key(),
                &self.stablecoin.key(),
                &[],
                amount,
            )?,
            &[
                self.mint.to_account_info(),
                self.recipient_token_account.to_account_info(),
                self.stablecoin.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        // Update quota tracking
        minter_info.minted_amount = new_minted;

        // Update global stats
        let stablecoin_key = self.stablecoin.key();
        let stablecoin = &mut self.stablecoin;
        stablecoin.total_minted = stablecoin
            .total_minted
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;

        // Enforce supply cap if configured (supply_cap != program_id means cap is set)
        if self.supply_cap.key() != crate::ID {
            let (expected_pda, _) =
                Pubkey::find_program_address(&[SUPPLY_CAP_SEED, stablecoin_key.as_ref()], &crate::ID);
            if self.supply_cap.key() == expected_pda {
                require_eq!(
                    self.supply_cap.owner,
                    &crate::ID,
                    StablecoinError::Unauthorized
                );
                let cap_data = self.supply_cap.try_borrow_data()?;
                require!(cap_data.len() >= 16, StablecoinError::MathOverflow);
                let cap = u64::from_le_bytes(
                    cap_data[8..16]
                        .try_into()
                        .map_err(|_| StablecoinError::MathOverflow)?,
                );
                if cap != u64::MAX && stablecoin.total_minted > cap {
                    return Err(StablecoinError::SupplyCapExceeded.into());
                }
            }
        }

        emit!(TokensMinted {
            stablecoin: stablecoin_key,
            minter: self.minter.key(),
            recipient: self.recipient_token_account.key(),
            amount,
            total_minted: stablecoin.total_minted,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
