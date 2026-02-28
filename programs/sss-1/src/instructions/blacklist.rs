use anchor_lang::prelude::*;
use crate::{
    error::StablecoinError, AddedToBlacklist, BlacklistEntry, RemovedFromBlacklist, RoleAccount,
    StablecoinState, BLACKLIST_SEED, MAX_REASON_LEN, ROLE_SEED, STABLECOIN_SEED,
};

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), blacklister.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        init_if_needed,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, stablecoin.key().as_ref(), address.key().as_ref()],
        bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The address being blacklisted
    pub address: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    #[account(
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), blacklister.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, stablecoin.key().as_ref(), address.key().as_ref()],
        bump = blacklist_entry.bump,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    /// CHECK: The address being removed from blacklist
    pub address: AccountInfo<'info>,
}

impl<'info> AddToBlacklist<'info> {
    pub fn add_to_blacklist(&mut self, reason: String, bumps: AddToBlacklistBumps) -> Result<()> {
        // Feature gate: only SSS-2 tokens support blacklisting
        require!(
            self.stablecoin.is_sss2(),
            StablecoinError::ComplianceNotEnabled
        );
        require!(
            self.role.roles.is_blacklister,
            StablecoinError::Unauthorized
        );
        require!(
            reason.len() <= MAX_REASON_LEN,
            StablecoinError::ReasonTooLong
        );

        // Return custom error when address is already blacklisted (init_if_needed loads existing account)
        if self.blacklist_entry.address != Pubkey::default() {
            return Err(StablecoinError::AlreadyBlacklisted.into());
        }

        self.blacklist_entry.set_inner(BlacklistEntry {
            stablecoin: self.stablecoin.key(),
            address: self.address.key(),
            reason: reason.clone(),
            blacklisted_at: Clock::get()?.unix_timestamp,
            blacklisted_by: self.blacklister.key(),
            bump: bumps.blacklist_entry,
        });

        emit!(AddedToBlacklist {
            stablecoin: self.stablecoin.key(),
            address: self.address.key(),
            reason,
            blacklisted_by: self.blacklister.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

impl<'info> RemoveFromBlacklist<'info> {
    pub fn remove_from_blacklist(&mut self) -> Result<()> {
        // Feature gate: only SSS-2 tokens support blacklisting
        require!(
            self.stablecoin.is_sss2(),
            StablecoinError::ComplianceNotEnabled
        );
        require!(
            self.role.roles.is_blacklister,
            StablecoinError::Unauthorized
        );

        emit!(RemovedFromBlacklist {
            stablecoin: self.stablecoin.key(),
            address: self.address.key(),
            removed_by: self.blacklister.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
