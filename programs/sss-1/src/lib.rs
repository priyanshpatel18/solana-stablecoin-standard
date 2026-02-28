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

declare_id!("47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ");

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::StablecoinError;

    #[test]
    fn constants_seeds_and_limits() {
        assert_eq!(STABLECOIN_SEED, b"stablecoin");
        assert_eq!(ROLE_SEED, b"role");
        assert_eq!(MINTER_SEED, b"minter");
        assert_eq!(BLACKLIST_SEED, b"blacklist");
        assert_eq!(MAX_NAME_LEN, 32);
        assert_eq!(MAX_SYMBOL_LEN, 10);
        assert_eq!(MAX_URI_LEN, 200);
        assert_eq!(MAX_REASON_LEN, 100);
    }

    #[test]
    fn role_flags_len_and_serialization() {
        assert_eq!(RoleFlags::LEN, 5);
        let all = RoleFlags {
            is_minter: true,
            is_burner: true,
            is_pauser: true,
            is_blacklister: true,
            is_seizer: true,
        };
        let bytes = all.try_to_vec().unwrap();
        assert_eq!(bytes.len(), 5);
        let decoded: RoleFlags = RoleFlags::deserialize(&mut &bytes[..]).unwrap();
        assert!(decoded.is_minter && decoded.is_seizer);
    }

    #[test]
    fn stablecoin_state_is_sss2() {
        let base = StablecoinState {
            authority: Pubkey::default(),
            mint: Pubkey::default(),
            name: String::new(),
            symbol: String::new(),
            uri: String::new(),
            decimals: 6,
            enable_permanent_delegate: false,
            enable_transfer_hook: false,
            default_account_frozen: false,
            paused: false,
            total_minted: 0,
            total_burned: 0,
            bump: 0,
        };
        assert!(!base.is_sss2());

        let sss2_like = StablecoinState {
            authority: Pubkey::default(),
            mint: Pubkey::default(),
            name: String::new(),
            symbol: String::new(),
            uri: String::new(),
            decimals: 6,
            enable_permanent_delegate: true,
            enable_transfer_hook: true,
            default_account_frozen: true,
            paused: false,
            total_minted: 0,
            total_burned: 0,
            bump: 0,
        };
        assert!(sss2_like.is_sss2());
    }

    #[test]
    fn stablecoin_error_variants_exist() {
        let _ = StablecoinError::Unauthorized;
        let _ = StablecoinError::Paused;
        let _ = StablecoinError::ComplianceNotEnabled;
        let _ = StablecoinError::AlreadyBlacklisted;
        let _ = StablecoinError::NotBlacklisted;
        let _ = StablecoinError::QuotaExceeded;
        let _ = StablecoinError::ZeroAmount;
        let _ = StablecoinError::NameTooLong;
        let _ = StablecoinError::SymbolTooLong;
        let _ = StablecoinError::UriTooLong;
        let _ = StablecoinError::ReasonTooLong;
        let _ = StablecoinError::Blacklisted;
        let _ = StablecoinError::MathOverflow;
        let _ = StablecoinError::InvalidRoleConfig;
    }
}

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
