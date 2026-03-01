use fuzz_accounts::*;
use solana_sdk::pubkey::Pubkey;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::solana_stablecoin_standard;
use types::InitializeParams;
use types::RoleFlags;
use types::StablecoinState;

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
        }
    }

    #[init]
    fn start(&mut self) {
        let payer = self.trident.payer().pubkey();
        self.trident.airdrop(
            &payer,
            10u64.checked_mul(LAMPORTS_PER_SOL).expect("lamports overflow"),
        );
    }

    #[flow]
    fn flow1(&mut self) {
        let program_id = solana_stablecoin_standard::program_id();
        let sss_hook = pubkey!("8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc");
        let authority = self.trident.payer().pubkey();
        let mint_kp = self.trident.random_keypair();
        let mint = mint_kp.pubkey();
        self.trident.set_extra_signers(vec![mint_kp]);

        let (stablecoin_pda, _) =
            Pubkey::find_program_address(&[b"stablecoin", mint.as_ref()], &program_id);
        let (authority_role_pda, _) = Pubkey::find_program_address(
            &[b"role", stablecoin_pda.as_ref(), authority.as_ref()],
            &program_id,
        );
        let (minter_info_pda, _) = Pubkey::find_program_address(
            &[b"minter", stablecoin_pda.as_ref(), authority.as_ref()],
            &program_id,
        );
        let (supply_cap_pda, _) =
            Pubkey::find_program_address(&[b"supply_cap", stablecoin_pda.as_ref()], &program_id);

        let params = InitializeParams::new(
            "SupplyCapCoin".to_string(),
            "SCC".to_string(),
            "https://example.com".to_string(),
            6,
            false,
            false,
            false,
        );
        let init_ix = solana_stablecoin_standard::InitializeStablecoinInstruction::data(
            solana_stablecoin_standard::InitializeStablecoinInstructionData::new(params),
        )
        .accounts(
            solana_stablecoin_standard::InitializeStablecoinInstructionAccounts::new(
                authority,
                stablecoin_pda,
                mint,
                authority_role_pda,
                sss_hook,
            ),
        )
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[init_ix], Some("InitializeStablecoin"));
        self.trident.clear_extra_signers();

        let roles = RoleFlags::new(true, false, false, false, false, false);
        let update_roles_ix = solana_stablecoin_standard::UpdateRolesInstruction::data(
            solana_stablecoin_standard::UpdateRolesInstructionData::new(roles),
        )
        .accounts(
            solana_stablecoin_standard::UpdateRolesInstructionAccounts::new(
                authority,
                stablecoin_pda,
                authority_role_pda,
                authority,
            ),
        )
        .instruction();
        let _ = self.trident.process_transaction(&[update_roles_ix], Some("UpdateRoles"));

        let update_minter_ix = solana_stablecoin_standard::UpdateMinterInstruction::data(
            solana_stablecoin_standard::UpdateMinterInstructionData::new(1_000_000),
        )
        .accounts(
            solana_stablecoin_standard::UpdateMinterInstructionAccounts::new(
                authority,
                stablecoin_pda,
                minter_info_pda,
                authority,
            ),
        )
        .instruction();
        let _ = self
            .trident
            .process_transaction(&[update_minter_ix], Some("UpdateMinter"));

        let cap = 100u64;
        let update_supply_cap_ix =
            solana_stablecoin_standard::UpdateSupplyCapInstruction::data(
                solana_stablecoin_standard::UpdateSupplyCapInstructionData::new(cap),
            )
            .accounts(
                solana_stablecoin_standard::UpdateSupplyCapInstructionAccounts::new(
                    authority,
                    stablecoin_pda,
                    supply_cap_pda,
                ),
            )
            .instruction();
        let _ = self
            .trident
            .process_transaction(&[update_supply_cap_ix], Some("UpdateSupplyCap"));

        let recipient = self.trident.random_keypair().pubkey();
        let ata_ixs = self.trident.initialize_associated_token_account_2022(
            &authority,
            &mint,
            &recipient,
            &[],
        );
        let _ = self.trident.process_transaction(&ata_ixs, Some("CreateATA"));

        let recipient_ata = spl_associated_token_account_interface::address::get_associated_token_address_with_program_id(
            &recipient,
            &mint,
            &spl_token_2022_interface::ID,
        );

        let mint_50_ix = solana_stablecoin_standard::MintTokensInstruction::data(
            solana_stablecoin_standard::MintTokensInstructionData::new(50),
        )
        .accounts(
            solana_stablecoin_standard::MintTokensInstructionAccounts::new(
                authority,
                stablecoin_pda,
                authority_role_pda,
                minter_info_pda,
                mint,
                recipient_ata,
                supply_cap_pda,
            ),
        )
        .instruction();
        let _ = self.trident.process_transaction(&[mint_50_ix], Some("Mint50"));

        let mint_60_ix = solana_stablecoin_standard::MintTokensInstruction::data(
            solana_stablecoin_standard::MintTokensInstructionData::new(60),
        )
        .accounts(
            solana_stablecoin_standard::MintTokensInstructionAccounts::new(
                authority,
                stablecoin_pda,
                authority_role_pda,
                minter_info_pda,
                mint,
                recipient_ata,
                supply_cap_pda,
            ),
        )
        .instruction();
        let result = self
            .trident
            .process_transaction(&[mint_60_ix], Some("MintOverCap"));

        assert!(
            result.is_error(),
            "flow1: mint over supply cap must fail (QuotaExceeded or SupplyCapExceeded)"
        );

        if let Some(state) = self
            .trident
            .get_account_with_type::<StablecoinState>(&stablecoin_pda, 8)
        {
            assert!(
                state.total_minted <= cap,
                "flow1: total_minted should not exceed supply cap"
            );
        }
    }

    #[flow]
    fn flow2(&mut self) {
        let program_id = solana_stablecoin_standard::program_id();
        let sss_hook = pubkey!("8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc");
        let authority = self.trident.payer().pubkey();
        let mint_kp = self.trident.random_keypair();
        let mint = mint_kp.pubkey();
        self.trident.set_extra_signers(vec![mint_kp]);

        let (stablecoin_pda, _) =
            Pubkey::find_program_address(&[b"stablecoin", mint.as_ref()], &program_id);
        let (authority_role_pda, _) = Pubkey::find_program_address(
            &[b"role", stablecoin_pda.as_ref(), authority.as_ref()],
            &program_id,
        );
        let (supply_cap_pda, _) =
            Pubkey::find_program_address(&[b"supply_cap", stablecoin_pda.as_ref()], &program_id);

        let params = InitializeParams::new(
            "Flow2Coin".to_string(),
            "F2C".to_string(),
            "https://example.com".to_string(),
            6,
            false,
            false,
            false,
        );
        let init_ix = solana_stablecoin_standard::InitializeStablecoinInstruction::data(
            solana_stablecoin_standard::InitializeStablecoinInstructionData::new(params),
        )
        .accounts(
            solana_stablecoin_standard::InitializeStablecoinInstructionAccounts::new(
                authority,
                stablecoin_pda,
                mint,
                authority_role_pda,
                sss_hook,
            ),
        )
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[init_ix], Some("InitializeStablecoin"));
        self.trident.clear_extra_signers();

        let attacker_kp = self.trident.random_keypair();
        let attacker = attacker_kp.pubkey();
        let update_supply_cap_ix =
            solana_stablecoin_standard::UpdateSupplyCapInstruction::data(
                solana_stablecoin_standard::UpdateSupplyCapInstructionData::new(1_000_000),
            )
            .accounts(
                solana_stablecoin_standard::UpdateSupplyCapInstructionAccounts::new(
                    attacker,
                    stablecoin_pda,
                    supply_cap_pda,
                ),
            )
            .instruction();

        self.trident.set_extra_signers(vec![attacker_kp]);
        let result = self
            .trident
            .process_transaction(&[update_supply_cap_ix], Some("UpdateSupplyCapAttacker"));
        self.trident.clear_extra_signers();

        assert!(
            result.is_error(),
            "flow2: UpdateSupplyCap by non-authority must fail"
        );
    }

    #[end]
    fn end(&mut self) {}
}

fn main() {
    FuzzTest::fuzz(500, 50);
}
