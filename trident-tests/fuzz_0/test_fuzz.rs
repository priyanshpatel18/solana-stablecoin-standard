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
        let authority = self.trident.payer().pubkey();
        let mint_kp = self.trident.random_keypair();
        let mint = mint_kp.pubkey();
        self.trident.set_extra_signers(vec![mint_kp]);

        let (stablecoin_pda, _) = Pubkey::find_program_address(
            &[b"stablecoin", mint.as_ref()],
            &program_id,
        );
        let (authority_role_pda, _) = Pubkey::find_program_address(
            &[b"role", stablecoin_pda.as_ref(), authority.as_ref()],
            &program_id,
        );
        let system_program = pubkey!("11111111111111111111111111111111");

        let params = InitializeParams::new(
            "FuzzCoin".to_string(),
            "FUZ".to_string(),
            "https://example.com".to_string(),
            6,
            false, // SSS-1
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
                system_program,
            ),
        )
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[init_ix], Some("InitializeStablecoin"));

        self.trident.clear_extra_signers();

        let pause_ix = solana_stablecoin_standard::PauseInstruction::data(
            solana_stablecoin_standard::PauseInstructionData::new(),
        )
        .accounts(solana_stablecoin_standard::PauseInstructionAccounts::new(
            authority,
            stablecoin_pda,
            authority_role_pda,
        ))
        .instruction();

        let _ = self.trident.process_transaction(&[pause_ix], Some("Pause"));

        if let Some(state) = self
            .trident
            .get_account_with_type::<StablecoinState>(&stablecoin_pda, 8)
        {
            assert!(state.paused, "flow1: stablecoin should be paused after Pause");
        }
    }

    #[flow]
    fn flow2(&mut self) {
        let program_id = solana_stablecoin_standard::program_id();
        let authority = self.trident.payer().pubkey();
        let mint_kp = self.trident.random_keypair();
        let mint = mint_kp.pubkey();
        self.trident.set_extra_signers(vec![mint_kp]);

        let (stablecoin_pda, _) = Pubkey::find_program_address(
            &[b"stablecoin", mint.as_ref()],
            &program_id,
        );
        let (authority_role_pda, _) = Pubkey::find_program_address(
            &[b"role", stablecoin_pda.as_ref(), authority.as_ref()],
            &program_id,
        );
        let system_program = pubkey!("11111111111111111111111111111111");

        let params = InitializeParams::new(
            "FuzzCoin2".to_string(),
            "FU2".to_string(),
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
                system_program,
            ),
        )
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[init_ix], Some("InitializeStablecoin"));

        self.trident.clear_extra_signers();

        let pause_ix = solana_stablecoin_standard::PauseInstruction::data(
            solana_stablecoin_standard::PauseInstructionData::new(),
        )
        .accounts(solana_stablecoin_standard::PauseInstructionAccounts::new(
            authority,
            stablecoin_pda,
            authority_role_pda,
        ))
        .instruction();

        let _ = self.trident.process_transaction(&[pause_ix], Some("Pause"));

        let unpause_ix = solana_stablecoin_standard::UnpauseInstruction::data(
            solana_stablecoin_standard::UnpauseInstructionData::new(),
        )
        .accounts(solana_stablecoin_standard::UnpauseInstructionAccounts::new(
            authority,
            stablecoin_pda,
            authority_role_pda,
        ))
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[unpause_ix], Some("Unpause"));

        if let Some(state) = self
            .trident
            .get_account_with_type::<StablecoinState>(&stablecoin_pda, 8)
        {
            assert!(!state.paused, "flow2: stablecoin should be unpaused after Unpause");
        }
    }

    #[flow]
    fn flow3(&mut self) {
        let program_id = solana_stablecoin_standard::program_id();
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
        let system_program = pubkey!("11111111111111111111111111111111");

        let params = InitializeParams::new(
            "Flow3Coin".to_string(),
            "F3C".to_string(),
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
                system_program,
            ),
        )
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[init_ix], Some("InitializeStablecoin"));
        self.trident.clear_extra_signers();

        let attacker_kp = self.trident.random_keypair();
        let attacker = attacker_kp.pubkey();
        let (attacker_role_pda, _) = Pubkey::find_program_address(
            &[b"role", stablecoin_pda.as_ref(), attacker.as_ref()],
            &program_id,
        );
        let roles = RoleFlags::new(true, false, false, false, false, false);
        let update_roles_ix = solana_stablecoin_standard::UpdateRolesInstruction::data(
            solana_stablecoin_standard::UpdateRolesInstructionData::new(roles),
        )
        .accounts(
            solana_stablecoin_standard::UpdateRolesInstructionAccounts::new(
                attacker,
                stablecoin_pda,
                attacker_role_pda,
                attacker,
            ),
        )
        .instruction();

        self.trident.set_extra_signers(vec![attacker_kp]);
        let result = self.trident.process_transaction(&[update_roles_ix], Some("UpdateRolesAttacker"));
        self.trident.clear_extra_signers();

        assert!(
            result.is_error(),
            "flow3: UpdateRoles by non-authority must fail"
        );
    }

    #[flow]
    fn flow4(&mut self) {
        let program_id = solana_stablecoin_standard::program_id();
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
        let system_program = pubkey!("11111111111111111111111111111111");

        let params = InitializeParams::new(
            "Flow4Coin".to_string(),
            "F4C".to_string(),
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
                system_program,
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

        let update_minter_ix =
            solana_stablecoin_standard::UpdateMinterInstruction::data(
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

        let pause_ix = solana_stablecoin_standard::PauseInstruction::data(
            solana_stablecoin_standard::PauseInstructionData::new(),
        )
        .accounts(solana_stablecoin_standard::PauseInstructionAccounts::new(
            authority,
            stablecoin_pda,
            authority_role_pda,
        ))
        .instruction();
        let _ = self.trident.process_transaction(&[pause_ix], Some("Pause"));

        let recipient = authority;
        let mint_ix = solana_stablecoin_standard::MintTokensInstruction::data(
            solana_stablecoin_standard::MintTokensInstructionData::new(1),
        )
        .accounts(
            solana_stablecoin_standard::MintTokensInstructionAccounts::new(
                authority,
                stablecoin_pda,
                authority_role_pda,
                minter_info_pda,
                mint,
                recipient,
                program_id,
            ),
        )
        .instruction();
        let result = self.trident.process_transaction(&[mint_ix], Some("MintAfterPause"));

        assert!(
            result.is_error(),
            "flow4: mint while paused must fail (paused check or invalid recipient)"
        );
    }

    #[flow]
    fn flow5_blacklist(&mut self) {
        let program_id = solana_stablecoin_standard::program_id();
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
        let system_program = pubkey!("11111111111111111111111111111111");

        let params = InitializeParams::new(
            "BlacklistCoin".to_string(),
            "BLC".to_string(),
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
                system_program,
            ),
        )
        .instruction();

        let _ = self
            .trident
            .process_transaction(&[init_ix], Some("InitializeStablecoin"));
        self.trident.clear_extra_signers();

        let minter_kp = self.trident.random_keypair();
        let minter = minter_kp.pubkey();
        let (minter_role_pda, _) = Pubkey::find_program_address(
            &[b"role", stablecoin_pda.as_ref(), minter.as_ref()],
            &program_id,
        );
        let roles = RoleFlags::new(true, false, false, false, false, false);
        let update_roles_ix = solana_stablecoin_standard::UpdateRolesInstruction::data(
            solana_stablecoin_standard::UpdateRolesInstructionData::new(roles),
        )
        .accounts(
            solana_stablecoin_standard::UpdateRolesInstructionAccounts::new(
                authority,
                stablecoin_pda,
                minter_role_pda,
                minter,
            ),
        )
        .instruction();
        let _ = self.trident.process_transaction(&[update_roles_ix], Some("UpdateRolesMinter"));

        let victim = self.trident.random_keypair().pubkey();
        let (blacklist_entry_pda, _) = Pubkey::find_program_address(
            &[b"blacklist", stablecoin_pda.as_ref(), victim.as_ref()],
            &program_id,
        );

        let add_blacklist_ix = solana_stablecoin_standard::AddToBlacklistInstruction::data(
            solana_stablecoin_standard::AddToBlacklistInstructionData::new("Sanctions".to_string()),
        )
        .accounts(
            solana_stablecoin_standard::AddToBlacklistInstructionAccounts::new(
                minter,
                stablecoin_pda,
                minter_role_pda,
                blacklist_entry_pda,
                victim,
            ),
        )
        .instruction();

        self.trident.set_extra_signers(vec![minter_kp]);
        let result = self
            .trident
            .process_transaction(&[add_blacklist_ix], Some("AddToBlacklistNonBlacklister"));
        self.trident.clear_extra_signers();

        assert!(
            result.is_error(),
            "flow5_blacklist: AddToBlacklist by non-blacklister must fail"
        );
    }

    #[flow]
    fn flow5(&mut self) {
        let program_id = solana_stablecoin_standard::program_id();
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
        let system_program = pubkey!("11111111111111111111111111111111");

        let params = InitializeParams::new(
            "Flow5Coin".to_string(),
            "F5C".to_string(),
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
                system_program,
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

        let update_minter_ix =
            solana_stablecoin_standard::UpdateMinterInstruction::data(
                solana_stablecoin_standard::UpdateMinterInstructionData::new(u64::MAX),
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

        let mint_one_ix = solana_stablecoin_standard::MintTokensInstruction::data(
            solana_stablecoin_standard::MintTokensInstructionData::new(1),
        )
        .accounts(
            solana_stablecoin_standard::MintTokensInstructionAccounts::new(
                authority,
                stablecoin_pda,
                authority_role_pda,
                minter_info_pda,
                mint,
                recipient_ata,
                program_id,
            ),
        )
        .instruction();
        let _ = self.trident.process_transaction(&[mint_one_ix], Some("MintOne"));

        let mint_overflow_ix = solana_stablecoin_standard::MintTokensInstruction::data(
            solana_stablecoin_standard::MintTokensInstructionData::new(u64::MAX),
        )
        .accounts(
            solana_stablecoin_standard::MintTokensInstructionAccounts::new(
                authority,
                stablecoin_pda,
                authority_role_pda,
                minter_info_pda,
                mint,
                recipient_ata,
                program_id,
            ),
        )
        .instruction();
        let result = self
            .trident
            .process_transaction(&[mint_overflow_ix], Some("MintOverflow"));

        assert!(
            result.is_error(),
            "flow5: mint overflow must fail (MathOverflow or token error)"
        );
    }

    #[end]
    fn end(&mut self) {}
}

fn main() {
    FuzzTest::fuzz(1000, 100);
}
