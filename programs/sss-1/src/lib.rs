pub mod constants;
pub mod enums;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use enums::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("BMWu6XvhKMXitwv3FCjjm2zZGD4pXeB1KX5oiUcPxGDB");

#[program]
pub mod solana_stablecoin_standard {
    use super::*;

    // === SSS-1 Instructions ===
    pub fn initialize_stablecoin(
        ctx: Context<InitializeStablecoin>,
        params: InitializeParams,
    ) -> Result<()> {
        ctx.accounts.initialize_stablecoin(params, ctx.bumps)
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        ctx.accounts.mint_tokens(amount)
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        ctx.accounts.burn_tokens(amount)
    }

    pub fn freeze_account(ctx: Context<FreezeTokenAccount>) -> Result<()> {
        ctx.accounts.freeze_token_account()
    }

    pub fn thaw_account(ctx: Context<ThawTokenAccount>) -> Result<()> {
        ctx.accounts.thaw_token_account()
    }

    pub fn pause(ctx: Context<PauseUnpause>) -> Result<()> {
        ctx.accounts.pause()
    }

    pub fn unpause(ctx: Context<PauseUnpause>) -> Result<()> {
        ctx.accounts.unpause()
    }

    pub fn update_roles(ctx: Context<UpdateRoles>, roles: RoleFlags) -> Result<()> {
        ctx.accounts.update_roles(roles)
    }

    pub fn update_minter(ctx: Context<UpdateMinter>, quota: u64) -> Result<()> {
        ctx.accounts.update_minter(quota)
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        ctx.accounts.transfer_authority()
    }

    // === SSS-2 Compliance Instructions ===

    pub fn add_to_blacklist(ctx: Context<AddToBlacklist>, reason: String) -> Result<()> {
        ctx.accounts.add_to_blacklist(reason, ctx.bumps)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        ctx.accounts.remove_from_blacklist()
    }

    pub fn seize(ctx: Context<Seize>) -> Result<()> {
        ctx.accounts.seize()
    }
}
