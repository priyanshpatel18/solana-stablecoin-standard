use anchor_lang::prelude::*;
use anchor_lang::system_program::System;
use anchor_lang::solana_program::program::invoke_signed;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_discriminator::discriminator::SplDiscriminate;

pub mod error;
use error::HookError;

declare_id!("GtYvo8PY7hV3KWfGHs3fPDyFEHRV4t1PVw6BkYUBgctC");

pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Initialize the ExtraAccountMetaList PDA.
    /// Defines which extra accounts Token-2022 must include on every transfer CPI.
    ///
    /// Extra account layout (Execute instruction accounts):
    ///   [0] source token account
    ///   [1] mint
    ///   [2] destination token account
    ///   [3] authority (source wallet owner)
    ///   [4] ExtraAccountMetaList PDA
    ///   --- extra accounts ---
    ///   [5] sss-token program ID (for PDA derivation)
    ///   [6] stablecoin state PDA: seeds=[b"stablecoin", mint(1)] under program(5)
    ///   [7] source blacklist PDA: seeds=[b"blacklist", stablecoin(6), authority(3)] under program(5)
    ///   [8] dest blacklist PDA:   seeds=[b"blacklist", stablecoin(6), dest_owner_from_data(2,32,32)] under program(5)
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetas>,
        sss_token_program_id: Pubkey,
    ) -> Result<()> {
        // Order matters: each account can only reference earlier accounts.
        let extra_account_metas = vec![
            // [5] sss-token program ID (literal, no dependencies)
            ExtraAccountMeta::new_with_pubkey(&sss_token_program_id, false, false)?,

            // [6] Stablecoin state PDA: seeds=[b"stablecoin", mint_key]
            //     External PDA owned by sss-token program (index 5)
            ExtraAccountMeta::new_external_pda_with_seeds(
                5, // program at index 5
                &[
                    Seed::Literal { bytes: b"stablecoin".to_vec() },
                    Seed::AccountKey { index: 1 }, // mint
                ],
                false,
                false,
            )?,

            // [7] Source blacklist entry PDA: seeds=[b"blacklist", stablecoin_key, source_authority]
            //     May or may not exist; if it does, source is blacklisted
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 6 }, // stablecoin state
                    Seed::AccountKey { index: 3 }, // authority (source wallet)
                ],
                false,
                false,
            )?,

            // [8] Destination blacklist entry PDA: seeds=[b"blacklist", stablecoin_key, dest_owner]
            //     dest_owner extracted from destination token account data bytes 32..64
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"blacklist".to_vec() },
                    Seed::AccountKey { index: 6 }, // stablecoin state
                    Seed::AccountData { account_index: 2, data_index: 32, length: 32 }, // dest owner
                ],
                false,
                false,
            )?,
        ];

        // Calculate required account size
        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
        let lamports = Rent::get()?.minimum_balance(account_size);

        // Derive PDA bump for signing
        let mint_key = ctx.accounts.mint.key();
        let (_, bump) = Pubkey::find_program_address(
            &[EXTRA_ACCOUNT_METAS_SEED, mint_key.as_ref()],
            &crate::ID,
        );

        // Create the ExtraAccountMetaList account (PDA must sign)
        invoke_signed(
            &anchor_lang::solana_program::system_instruction::create_account(
                &ctx.accounts.authority.key(),
                &ctx.accounts.extra_account_meta_list.key(),
                lamports,
                account_size as u64,
                &crate::ID,
            ),
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.extra_account_meta_list.to_account_info(),
            ],
            &[&[EXTRA_ACCOUNT_METAS_SEED, mint_key.as_ref(), &[bump]]],
        )?;

        // Initialize the ExtraAccountMetaList with our account definitions
        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

        Ok(())
    }

    /// Fallback handler — Token-2022 CPIs here on every transfer.
    /// Verifies the Execute discriminator, checks pause status, and checks blacklist.
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        // Verify Execute instruction discriminator
        if data.len() < 8 {
            return Err(HookError::InvalidInstruction.into());
        }
        let discriminator = &data[..8];
        if discriminator != ExecuteInstruction::SPL_DISCRIMINATOR_SLICE {
            return Err(HookError::InvalidInstruction.into());
        }

        // Accounts layout:
        // [0] source, [1] mint, [2] dest, [3] authority, [4] extra_meta_list
        // [5] sss-token program, [6] stablecoin state, [7] source blacklist, [8] dest blacklist

        // Check pause: read the `paused` flag from the stablecoin state PDA.
        // The flag is embedded in a Borsh-serialized struct with variable-length
        // strings, so we must walk the layout dynamically to find it.
        if accounts.len() > 6 {
            let stablecoin_data = accounts[6].try_borrow_data()?;
            if read_paused_flag(&stablecoin_data) {
                return Err(HookError::Paused.into());
            }
        }

        // Check blacklist: if the PDA account has data, the address is blacklisted
        if accounts.len() > 7 {
            let source_blacklist = &accounts[7];
            if source_blacklist.data_len() > 0 && **source_blacklist.try_borrow_lamports()? > 0 {
                return Err(HookError::Blacklisted.into());
            }
        }

        if accounts.len() > 8 {
            let dest_blacklist = &accounts[8];
            if dest_blacklist.data_len() > 0 && **dest_blacklist.try_borrow_lamports()? > 0 {
                return Err(HookError::Blacklisted.into());
            }
        }

        // Transfer allowed
        Ok(())
    }
}

/// Read the `paused` flag from a Borsh-serialized StablecoinState account.
///
/// Layout:
///   8  bytes — Anchor discriminator
///   32 bytes — authority (Pubkey)
///   32 bytes — mint (Pubkey)
///   4 + N    — name (String: 4-byte LE length prefix + UTF-8 bytes)
///   4 + N    — symbol (String)
///   4 + N    — uri (String)
///   1  byte  — decimals
///   1  byte  — enable_permanent_delegate
///   1  byte  — enable_transfer_hook
///   1  byte  — default_account_frozen
///   1  byte  — paused  ← this is what we read
fn read_paused_flag(data: &[u8]) -> bool {
    // Skip discriminator + authority + mint
    let mut offset: usize = 8 + 32 + 32; // 72

    // Skip three variable-length Borsh strings (name, symbol, uri)
    for _ in 0..3 {
        if data.len() < offset + 4 {
            return false;
        }
        let str_len = u32::from_le_bytes(
            data[offset..offset + 4].try_into().unwrap_or([0; 4]),
        ) as usize;
        offset += 4 + str_len;
    }

    // Skip decimals(1) + enable_permanent_delegate(1) + enable_transfer_hook(1) + default_account_frozen(1)
    offset += 4;

    // Read the paused byte
    if data.len() <= offset {
        return false;
    }
    data[offset] != 0
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The ExtraAccountMetaList PDA — initialized here.
    /// Seeds: ["extra-account-metas", mint]
    #[account(mut)]
    pub extra_account_meta_list: AccountInfo<'info>,

    /// CHECK: The Token-2022 mint that has this hook attached
    pub mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
