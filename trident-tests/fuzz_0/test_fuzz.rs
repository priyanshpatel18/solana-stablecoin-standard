use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::solana_stablecoin_standard;
use types::InitializeParams;
use types::StablecoinState;

#[derive(FuzzTestMethods)]
struct FuzzTest {
    /// Trident client for interacting with the Solana program
    trident: Trident,
    /// Storage for all account addresses used in fuzz testing
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
        // Optional: airdrop to payer so they can pay for init
        let payer = self.trident.payer().pubkey();
        self.trident.airdrop(&payer, 10 * LAMPORTS_PER_SOL);
    }

    #[flow]
    fn flow1(&mut self) {
        // Flow 1: Initialize stablecoin (SSS-1) with a fresh mint, then Pause
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

        // Pause (reuse same PDAs from this flow)
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

        // Invariant: stablecoin state is paused
        if let Some(state) = self
            .trident
            .get_account_with_type::<StablecoinState>(&stablecoin_pda, 8)
        {
            assert!(state.paused, "flow1: stablecoin should be paused after Pause");
        }
    }

    #[flow]
    fn flow2(&mut self) {
        // Flow 2: Init (fresh mint) + Pause + Unpause so Unpause runs against existing state
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

        // Invariant: stablecoin state is unpaused
        if let Some(state) = self
            .trident
            .get_account_with_type::<StablecoinState>(&stablecoin_pda, 8)
        {
            assert!(!state.paused, "flow2: stablecoin should be unpaused after Unpause");
        }
    }

    #[end]
    fn end(&mut self) {
        // Per-iteration invariants are asserted in flows (e.g. flow1 asserts paused after Pause).
        // No global state to check here since each flow creates its own stablecoin.
    }
}

fn main() {
    FuzzTest::fuzz(1000, 100);
}
