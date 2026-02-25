/**
 * Integration tests that use the TypeScript SDK (SolanaStablecoin.load, getState, mint, etc.).
 * These run after the program is deployed (anchor test) and rely on the same provider/setup as sss-token.test.ts.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  SolanaStablecoin,
  Presets,
  findStablecoinPDA,
  findRolePDA,
  findMinterPDA,
} from "@stbr/sss-token";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  buildInitializeIx,
  buildUpdateRolesIx,
  buildUpdateMinterIx,
  createTokenAccount,
} from "./helpers";
import idl from "../sdk/core/src/idl/solana_stablecoin_standard.json";

describe("SDK integration (SSS-1 flow)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const authority = provider.wallet.payer as Keypair;

  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let recipientKeypair: Keypair;

  before(async () => {
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    const tx = new Transaction();
    for (const kp of [minterKeypair, recipientKeypair]) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: kp.publicKey,
          lamports: 10 * LAMPORTS_PER_SOL,
        })
      );
    }
    await provider.sendAndConfirm(tx);
  });

  it("creates SSS-1 stablecoin with helpers then loads with SDK", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const ix = buildInitializeIx(
      authority.publicKey,
      stablecoinPDA,
      mintKeypair.publicKey,
      authorityRole,
      SSS_HOOK_PROGRAM_ID,
      {
        name: "SDK Test USD",
        symbol: "SUSD",
        uri: "https://example.com/susd.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      }
    );
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(ix),
      [authority, mintKeypair]
    );

    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    const state = await stable.getState();
    expect(state.name).to.equal("SDK Test USD");
    expect(state.symbol).to.equal("SUSD");
    expect(state.decimals).to.equal(6);
    expect(state.paused).to.be.false;
    expect(stable.isSSS2()).to.be.false;
  });

  it("SDK getTotalSupply and mint after roles set", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfoPDA] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    const quota = BigInt(1_000_000 * 1e6);
    const updateRolesIx = buildUpdateRolesIx(
      authority.publicKey,
      stablecoinPDA,
      minterRole,
      minterKeypair.publicKey,
      { isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false }
    );
    const updateMinterIx = buildUpdateMinterIx(
      authority.publicKey,
      stablecoinPDA,
      minterInfoPDA,
      minterKeypair.publicKey,
      quota
    );
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(updateRolesIx).add(updateMinterIx),
      [authority]
    );

    const recipientAta = await createTokenAccount(
      connection,
      authority,
      mintKeypair.publicKey,
      recipientKeypair.publicKey
    );
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    const supplyBefore = await stable.getTotalSupply();
    expect(supplyBefore.toNumber()).to.equal(0);

    const amount = BigInt(100 * 1e6);
    const sig = await stable.mint(minterKeypair.publicKey, {
      recipient: recipientKeypair.publicKey,
      amount,
      minter: minterKeypair.publicKey,
    });
    expect(sig).to.be.a("string");

    const supplyAfter = await stable.getTotalSupply();
    expect(supplyAfter.toNumber()).to.equal(amount);
  });
});
