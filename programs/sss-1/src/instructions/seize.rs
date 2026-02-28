use anchor_lang::prelude::*;
use spl_token_2022::{
    extension::StateWithExtensions,
    onchain,
    state::Account as SplAccount,
};

use crate::constants::*;
use crate::error::StablecoinError;
use crate::events::TokensSeized;
use crate::state::*;

#[derive(Accounts)]
pub struct Seize<'info> {
    pub seizer: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), seizer.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: Token-2022 mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Source token account to seize from
    #[account(mut)]
    pub source_token_account: AccountInfo<'info>,

    /// CHECK: Destination treasury token account
    #[account(mut)]
    pub destination_token_account: AccountInfo<'info>,

    /// CHECK: Transfer hook program (required when mint has transfer hook extension)
    pub transfer_hook_program: AccountInfo<'info>,

    /// CHECK: ExtraAccountMetaList PDA for the hook (seeds: ["extra-account-metas", mint], program: transfer_hook_program)
    pub extra_account_metas: AccountInfo<'info>,

    /// CHECK: SSS token program (for hook's extra-account resolution)
    #[account(address = crate::ID)]
    pub sss_token_program: AccountInfo<'info>,

    /// CHECK: Source blacklist PDA (seeds: ["blacklist", stablecoin, source_owner])
    pub source_blacklist: AccountInfo<'info>,

    /// CHECK: Destination blacklist PDA (seeds: ["blacklist", stablecoin, dest_owner])
    pub dest_blacklist: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

impl<'info> Seize<'info> {
    pub fn seize(&mut self) -> Result<()> {
        // NOTE: Seizure uses the transfer hook CPI (invoke_transfer_checked). If the SSS transfer
        // hook enforces blacklist checks on source or destination, and either account is blacklisted,
        // the hook may block the seizure. Seizures are intended to move tokens from a seized account
        // to the treasury; ensure the transfer hook is configured to allow seizure flows, or that
        // source/dest are not blacklisted when invoking this instruction.

        // Feature gate: only SSS-2 tokens support seizure (both permanent_delegate AND transfer_hook)
        require!(
            self.stablecoin.is_sss2(),
            StablecoinError::ComplianceNotEnabled
        );
        require!(self.role.roles.is_seizer, StablecoinError::Unauthorized);

        // Validate transfer hook program and extra_account_metas match expected SSS-2 hook.
        require_eq!(
            self.transfer_hook_program.key(),
            SSS_TRANSFER_HOOK_PROGRAM_ID,
            StablecoinError::Unauthorized
        );
        let (expected_meta_pda, _) = Pubkey::find_program_address(
            &[EXTRA_ACCOUNT_METAS_SEED, self.mint.key().as_ref()],
            &SSS_TRANSFER_HOOK_PROGRAM_ID,
        );
        require_eq!(
            self.extra_account_metas.key(),
            expected_meta_pda,
            StablecoinError::Unauthorized
        );

        // Read full balance from source token account.
        // Must use StateWithExtensions (not Pack::unpack) because Token-2022 accounts
        // carry TLV extension data beyond the base 165-byte layout, and Pack::unpack
        // enforces a strict length == 165 check that always fails on Token-2022 accounts.
        let source_data = self.source_token_account.try_borrow_data()?;
        let source_account = StateWithExtensions::<SplAccount>::unpack(&source_data)?;
        let amount = source_account.base.amount;
        drop(source_data);

        require!(amount > 0, StablecoinError::ZeroAmount);

        // CPI: transfer_checked using permanent delegate authority (stablecoin PDA)
        let mint_key = self.mint.key();
        let signer_seeds: &[&[u8]] = &[
            STABLECOIN_SEED,
            mint_key.as_ref(),
            &[self.stablecoin.bump],
        ];

        // When the mint has a transfer hook, Token-2022 CPIs to the hook; it must be in the tx.
        // Pass hook program, extra_account_metas, and hook-required accounts so invoke_transfer_checked
        // can build the full CPI instruction.
        let additional_accounts: &[AccountInfo] = &[
            self.transfer_hook_program.to_account_info(),
            self.extra_account_metas.to_account_info(),
            self.sss_token_program.to_account_info(),
            self.stablecoin.to_account_info(),
            self.source_blacklist.to_account_info(),
            self.dest_blacklist.to_account_info(),
        ];
        onchain::invoke_transfer_checked(
            &self.token_program.key(),
            self.source_token_account.to_account_info(),
            self.mint.to_account_info(),
            self.destination_token_account.to_account_info(),
            self.stablecoin.to_account_info(),
            additional_accounts,
            amount,
            self.stablecoin.decimals,
            &[signer_seeds],
        )?;

        emit!(TokensSeized {
            stablecoin: self.stablecoin.key(),
            from: self.source_token_account.key(),
            to: self.destination_token_account.key(),
            amount,
            seized_by: self.seizer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
