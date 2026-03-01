use trident_fuzz::fuzzing::*;

#[derive(Default)]
#[allow(dead_code)]
pub struct AccountAddresses {
    pub blacklister: AddressStorage,

    pub stablecoin: AddressStorage,

    pub role: AddressStorage,

    pub blacklist_entry: AddressStorage,

    pub address: AddressStorage,

    pub system_program: AddressStorage,

    pub burner: AddressStorage,

    pub mint: AddressStorage,

    pub burner_token_account: AddressStorage,

    pub token_program: AddressStorage,

    pub authority: AddressStorage,

    pub target_token_account: AddressStorage,

    pub authority_role: AddressStorage,

    pub transfer_hook_program: AddressStorage,

    pub minter: AddressStorage,

    pub minter_info: AddressStorage,

    pub recipient_token_account: AddressStorage,

    pub supply_cap: AddressStorage,

    pub seizer: AddressStorage,

    pub source_token_account: AddressStorage,

    pub destination_token_account: AddressStorage,

    pub extra_account_metas: AddressStorage,

    pub sss_token_program: AddressStorage,

    pub source_blacklist: AddressStorage,

    pub dest_blacklist: AddressStorage,

    pub new_authority: AddressStorage,

    pub holder: AddressStorage,

    pub extra_account_meta_list: AddressStorage,
}
