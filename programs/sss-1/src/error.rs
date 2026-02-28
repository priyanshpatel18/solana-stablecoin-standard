use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Unauthorized: caller lacks required role")]
    Unauthorized,

    #[msg("Stablecoin is paused")]
    Paused,

    #[msg("Compliance module not enabled for this stablecoin")]
    ComplianceNotEnabled,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,

    #[msg("URI too long (max 200 characters)")]
    UriTooLong,

    #[msg("Reason too long (max 100 characters)")]
    ReasonTooLong,

    #[msg("Address is blacklisted")]
    Blacklisted,

    #[msg("Arithmetic overflow")]
    MathOverflow,

    #[msg("Invalid role configuration")]
    InvalidRoleConfig,

    #[msg("Supply cap exceeded")]
    SupplyCapExceeded,
}
