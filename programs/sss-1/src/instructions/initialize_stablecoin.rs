use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use spl_token_2022::{
    extension::default_account_state::instruction as default_state_ix,
    extension::transfer_hook::instruction as transfer_hook_ix, extension::ExtensionType,
    instruction as token_instruction,
};

use crate::error::StablecoinError;
use crate::events::StablecoinInitialized;
use crate::state::*;
use crate::{constants::*, RoleFlags};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

#[derive(Accounts)]
pub struct InitializeStablecoin<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + StablecoinState::INIT_SPACE,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump,
    )]
    pub stablecoin: Account<'info, StablecoinState>,

    /// CHECK: Will be initialized as Token-2022 mint via CPI
    #[account(mut)]
    pub mint: Signer<'info>,

    /// The initial role account for the authority (gets all roles)
    #[account(
        init,
        payer = authority,
        space = RoleAccount::LEN,
        seeds = [ROLE_SEED, stablecoin.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub authority_role: Account<'info, RoleAccount>,

    /// CHECK: Transfer hook program (pass system program ID if not using hooks)
    pub transfer_hook_program: AccountInfo<'info>,

    /// CHECK: Must be the Token-2022 program — prevents CPI redirection attacks
    #[account(address = spl_token_2022::ID)]
    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeStablecoin<'info> {
    pub fn initialize_stablecoin(
        &mut self,
        params: InitializeParams,
        bumps: InitializeStablecoinBumps,
    ) -> Result<()> {
        // 1. Validate input
        require!(
            params.name.len() <= MAX_NAME_LEN,
            StablecoinError::NameTooLong
        );
        require!(
            params.symbol.len() <= MAX_SYMBOL_LEN,
            StablecoinError::SymbolTooLong
        );
        require!(params.uri.len() <= MAX_URI_LEN, StablecoinError::UriTooLong);
        require!(params.decimals <= 18, StablecoinError::InvalidRoleConfig);

        // 2. Validate transfer hook program when enable_transfer_hook is true
        if params.enable_transfer_hook {
            require_eq!(
                self.transfer_hook_program.key(),
                SSS_TRANSFER_HOOK_PROGRAM_ID,
                StablecoinError::Unauthorized
            );
        }

        // 3. Determine Token-2022 extensions
        let mut extension_types = vec![ExtensionType::MintCloseAuthority];

        if params.enable_permanent_delegate {
            extension_types.push(ExtensionType::PermanentDelegate);
        }
        if params.enable_transfer_hook {
            extension_types.push(ExtensionType::TransferHook);
        }
        if params.default_account_frozen {
            extension_types.push(ExtensionType::DefaultAccountState);
        }

        // 4. Create the mint account with sufficient space
        let mint_space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(
            &extension_types,
        )
        .map_err(|_| StablecoinError::MathOverflow)?;

        let rent = Rent::get()?;
        let mint_rent = rent.minimum_balance(mint_space);

        invoke(
            &anchor_lang::solana_program::system_instruction::create_account(
                &self.authority.key(),
                &self.mint.key(),
                mint_rent,
                mint_space as u64,
                &self.token_program.key(),
            ),
            &[
                self.authority.to_account_info(),
                self.mint.to_account_info(),
            ],
        )?;

        // 5. Initialize extensions (BEFORE InitializeMint)

        // MintCloseAuthority → stablecoin PDA can close the mint
        invoke(
            &token_instruction::initialize_mint_close_authority(
                &self.token_program.key(),
                &self.mint.key(),
                Some(&self.stablecoin.key()),
            )?,
            &[self.mint.to_account_info()],
        )?;

        // PermanentDelegate → stablecoin PDA can seize tokens from any holder (SSS-2)
        if params.enable_permanent_delegate {
            invoke(
                &token_instruction::initialize_permanent_delegate(
                    &self.token_program.key(),
                    &self.mint.key(),
                    &self.stablecoin.key(),
                )?,
                &[self.mint.to_account_info()],
            )?;
        }

        // TransferHook → enforces blacklist check on every transfer (SSS-2)
        if params.enable_transfer_hook {
            invoke(
                &transfer_hook_ix::initialize(
                    &self.token_program.key(),
                    &self.mint.key(),
                    Some(self.stablecoin.key()),
                    Some(self.transfer_hook_program.key()),
                )?,
                &[self.mint.to_account_info()],
            )?;
        }

        // DefaultAccountState → new token accounts start frozen (SSS-2)
        if params.default_account_frozen {
            invoke(
                &default_state_ix::initialize_default_account_state(
                    &self.token_program.key(),
                    &self.mint.key(),
                    &spl_token_2022::state::AccountState::Frozen,
                )?,
                &[self.mint.to_account_info()],
            )?;
        }

        // 6. Initialize the mint
        // Both mint authority and freeze authority are the stablecoin PDA,
        // ensuring all operations go through our program's RBAC checks.
        invoke(
            &token_instruction::initialize_mint2(
                &self.token_program.key(),
                &self.mint.key(),
                &self.stablecoin.key(),
                Some(&self.stablecoin.key()),
                params.decimals,
            )?,
            &[self.mint.to_account_info()],
        )?;

        // 6. Populate StablecoinState PDA
        self.stablecoin.set_inner(StablecoinState {
            authority: self.authority.key(),
            mint: self.mint.key(),
            name: params.name.clone(),
            symbol: params.symbol.clone(),
            uri: params.uri.clone(),
            decimals: params.decimals,
            enable_permanent_delegate: params.enable_permanent_delegate,
            enable_transfer_hook: params.enable_transfer_hook,
            default_account_frozen: params.default_account_frozen,
            paused: false,
            total_minted: 0,
            total_burned: 0,
            bump: bumps.stablecoin,
        });

        // 7. Grant all roles to the initializing authority
        self.authority_role.set_inner(RoleAccount {
            stablecoin: self.stablecoin.key(),
            holder: self.authority.key(),
            roles: RoleFlags {
                is_minter: true,
                is_burner: true,
                is_pauser: true,
                is_freezer: true,
                is_blacklister: true,
                is_seizer: true,
            },
            bump: bumps.authority_role,
        });

        // 8. Emit audit event
        emit!(StablecoinInitialized {
            stablecoin: self.stablecoin.key(),
            mint: self.mint.key(),
            authority: self.authority.key(),
            name: params.name,
            symbol: params.symbol,
            is_sss2: self.stablecoin.is_sss2(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
