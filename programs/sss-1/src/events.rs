use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub stablecoin: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub is_sss2: bool,
    pub timestamp: i64,
}

#[event]
pub struct TokensMinted {
    pub stablecoin: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_minted: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokensBurned {
    pub stablecoin: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
    pub total_burned: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub stablecoin: Pubkey,
    pub account: Pubkey,
    pub frozen_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccountThawed {
    pub stablecoin: Pubkey,
    pub account: Pubkey,
    pub thawed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinPaused {
    pub stablecoin: Pubkey,
    pub paused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StablecoinUnpaused {
    pub stablecoin: Pubkey,
    pub unpaused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RolesUpdated {
    pub stablecoin: Pubkey,
    pub holder: Pubkey,
    pub is_minter: bool,
    pub is_burner: bool,
    pub is_pauser: bool,
    pub is_freezer: bool,
    pub is_blacklister: bool,
    pub is_seizer: bool,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MinterUpdated {
    pub stablecoin: Pubkey,
    pub minter: Pubkey,
    pub new_quota: u64,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SupplyCapUpdated {
    pub stablecoin: Pubkey,
    pub new_cap: u64,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub stablecoin: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AddedToBlacklist {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    pub reason: String,
    pub blacklisted_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RemovedFromBlacklist {
    pub stablecoin: Pubkey,
    pub address: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokensSeized {
    pub stablecoin: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub seized_by: Pubkey,
    pub timestamp: i64,
}
