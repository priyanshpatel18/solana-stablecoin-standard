use anchor_lang::prelude::*;

/// Bitflag roles for gas-efficient storage.
/// Each role maps to a specific capability in the stablecoin system.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace)]
pub struct RoleFlags {
    pub is_minter: bool,
    pub is_burner: bool,
    pub is_pauser: bool,
    pub is_blacklister: bool,
    pub is_seizer: bool,
}

impl RoleFlags {
    pub const LEN: usize = 5; // 5 booleans
}
