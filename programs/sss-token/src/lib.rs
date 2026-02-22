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

declare_id!("BMWu6XvhKMXitwv3FCjjm2zZGD4pXeB1KX5oiUcPxGDB");

#[program]
pub mod solana_stablecoin_standard {
    use super::*;

    pub fn initialize(ctx: Context<InitializeStablecoin>, params: InitializeParams) -> Result<()> {
        ctx.accounts.initialize_stablecoin(params, ctx.bumps)
    }
}
