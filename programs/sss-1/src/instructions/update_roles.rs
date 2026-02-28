use anchor_lang::prelude::*;

use crate::error::StablecoinError;
use crate::events::RolesUpdated;
use crate::state::*;
use crate::{constants::*, RoleFlags};

#[derive(Accounts)]
pub struct UpdateRoles<'info> {
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
        space = RoleAccount::LEN,
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), holder.key().as_ref()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// CHECK: The account receiving role assignment
    pub holder: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> UpdateRoles<'info> {
    pub fn update_roles(&mut self, roles: RoleFlags) -> Result<()> {
        require!(
            self.holder.key() != Pubkey::default(),
            StablecoinError::InvalidRoleConfig
        );
        // NOTE: Role combination is unrestricted. Deployers should implement separation
        // of duties at the organizational level (e.g. separate minter/burner, blacklister).
        self.role.set_inner(RoleAccount {
            stablecoin: self.stablecoin.key(),
            holder: self.holder.key(),
            roles,
            bump: self.role.bump,
        });

        emit!(RolesUpdated {
            stablecoin: self.stablecoin.key(),
            holder: self.holder.key(),
            is_minter: roles.is_minter,
            is_burner: roles.is_burner,
            is_pauser: roles.is_pauser,
            is_freezer: roles.is_freezer,
            is_blacklister: roles.is_blacklister,
            is_seizer: roles.is_seizer,
            updated_by: self.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
