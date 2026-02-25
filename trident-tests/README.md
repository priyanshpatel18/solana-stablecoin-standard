# Trident Fuzz Tests for SSS

This directory holds [Trident](https://ackee.xyz/trident/docs/latest/) fuzz tests for the Solana Stablecoin Standard (sss-1) program. The `fuzz_0` target and generated `types.rs` / `fuzz_accounts.rs` are already in place.

**Why more files than a minimal Trident setup?** This repo uses a **patched `trident-fuzz`** (in `trident-fuzz/`) so that instructions like `InitializeStablecoin` can be signed with a mint keypair. We also implement **custom flows** (init → pause → unpause) with **invariant checks** and a workspace-level `resolver` in `Cargo.toml`. Compared to a minimal or reference repo (e.g. Solana Vault Standard), we have more files because of this patched dependency and the full flow/invariant implementation—no need to remove any; this setup is intended to be more complete.

## Run fuzz tests

1. **Install Trident CLI** (once):

   ```bash
   cargo install trident-cli
   ```

2. **Build the SSS program** (from repo root). Trident loads the program from `../target/deploy/sss_1.so`:

   ```bash
   cd /path/to/solana-stablecoin-standard
   anchor build
   ```

3. **Run the fuzz target** (from this directory):

   ```bash
   cd trident-tests
   trident fuzz run fuzz_0
   ```

   Optional: fixed seed for reproducibility — `trident fuzz run fuzz_0 12345`. Enable logging: `TRIDENT_LOG=1 trident fuzz run fuzz_0`.

## Troubleshooting

- **`zsh: command not found: trident`** — Install the CLI: `cargo install trident-cli`. Ensure `~/.cargo/bin` is in your `PATH`.
- **`no bin target named fuzz_0`** — The fuzz target was created by `trident init --force` from repo root. If you only have `Trident.toml`, run from repo root: `trident init --force` to generate `fuzz_0/`, `Cargo.toml`, and types; our `Trident.toml` is kept and points at the SSS program.
- **Program / load errors** — Ensure `anchor build` was run from repo root so `target/deploy/sss_1.so` exists.

## Customizing flows

The generated `fuzz_0/test_fuzz.rs` has empty `flow1` and `flow2`. Implement them using the instruction builders in `types.rs` (e.g. `solana_stablecoin_standard::InitializeStablecoinInstruction`, `MintTokensInstruction`) and `fuzz_accounts` for account addresses. See [Trident: Writing fuzz tests](https://ackee.xyz/trident/docs/latest/start-fuzzing/writting-fuzz-test/) and add invariant checks in `#[end]` or flow methods.

**Local patch:** This project uses a patched `trident-fuzz` (see `trident-fuzz/`) so that transactions are signed with the payer and optional extra signers (e.g. a mint keypair for `InitializeStablecoin`). Flow1: init + pause and asserts stablecoin is paused. Flow2: init + pause + unpause and asserts stablecoin is unpaused. Both flows use a fresh mint per run and `set_extra_signers` for init.

**Invariants to assert:**

- **Supply:** Total supply equals total minted minus total burned (from stablecoin state account).
- **Pause:** When paused, `mint_tokens` and `burn_tokens` must fail.
- **Blacklist (SSS-2):** Transfers involving a blacklisted address must be rejected by the transfer hook.
- **Roles:** Only the master authority can update roles; only minters can mint (within quota); only blacklister can add/remove blacklist; only seizer can seize.
- **Decimals:** Mint amount and burn amount must not overflow when scaled by decimals.

See [../docs/TESTING.md](../docs/TESTING.md) for the full testing guide.
