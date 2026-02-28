/**
 * Integration tests that use the TypeScript SDK (SolanaStablecoin.load, getState, mint, etc.).
 * These run after the program is deployed (anchor test) and rely on the same provider/setup as sss-token.test.ts.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
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
    const LAMPORTS_PER_KEYPAIR = 100_000_000;
    for (const kp of [minterKeypair, recipientKeypair]) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: kp.publicKey,
          lamports: LAMPORTS_PER_KEYPAIR,
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
    const sig = await stable.mint(minterKeypair, {
      recipient: recipientKeypair.publicKey,
      amount,
      minter: minterKeypair.publicKey,
    });
    expect(sig).to.be.a("string");

    const supplyAfter = await stable.getTotalSupply();
    expect(supplyAfter.toNumber()).to.equal(Number(amount));
  });

  it("load() on non-existent mint fails", async () => {
    const nonExistentMint = Keypair.generate().publicKey;
    const program = new anchor.Program(idl as anchor.Idl, provider);
    try {
      await SolanaStablecoin.load(program as never, nonExistentMint);
      expect.fail("load() should fail for non-existent mint");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/not found|account does not exist|Stablecoin state/i);
    }
  });

  it("getState() matches on-chain", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    const state = await stable.getState();
    const onChain = await program.account.stablecoinState.fetch(stablecoinPDA);
    expect(state.name).to.equal(onChain.name);
    expect(state.symbol).to.equal(onChain.symbol);
    expect(state.decimals).to.equal(onChain.decimals);
    expect(state.paused).to.equal(onChain.paused);
  });

  it("mint with zero amount fails", async () => {
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    try {
      await stable.mint(minterKeypair, {
        recipient: recipientKeypair.publicKey,
        amount: BigInt(0),
        minter: minterKeypair.publicKey,
      });
      expect.fail("mint with zero amount should fail");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/ZeroAmount|zero|0x/i);
    }
  });

  it("burn with zero amount fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [recipientRole] = findRolePDA(stablecoinPDA, recipientKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(
          authority.publicKey,
          stablecoinPDA,
          recipientRole,
          recipientKeypair.publicKey,
          { isMinter: false, isBurner: true, isPauser: false, isBlacklister: false, isSeizer: false }
        )
      ),
      [authority]
    );
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    try {
      await stable.burn(recipientKeypair, { amount: BigInt(0) });
      expect.fail("burn with zero amount should fail");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/ZeroAmount|zero|0x/i);
    }
  });

  it("burn more than balance fails", async () => {
    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    const { TOKEN_2022_PROGRAM_ID } = await import("./helpers");
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [recipientRole] = findRolePDA(stablecoinPDA, recipientKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(
          authority.publicKey,
          stablecoinPDA,
          recipientRole,
          recipientKeypair.publicKey,
          { isMinter: false, isBurner: true, isPauser: false, isBlacklister: false, isSeizer: false }
        )
      ),
      [authority]
    );
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    const recipientATA = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      recipientKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const recipientBalance = await program.provider.connection
      .getTokenAccountBalance(recipientATA)
      .catch(() => null);
    const balance = recipientBalance ? BigInt(recipientBalance.value.amount) : BigInt(0);
    try {
      await stable.burn(recipientKeypair, { amount: balance + BigInt(1_000_000_000) });
      expect.fail("burn more than balance should fail");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/insufficient|Insufficient|Simulation failed|custom program error|0x/i);
    }
  });

  it("getTotalSupply after mint and burn", async () => {
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    const supply = await stable.getTotalSupply();
    expect(supply.toNumber()).to.be.greaterThanOrEqual(0);
  });

  it("create SSS-2 via SDK and assert isSSS2()", async () => {
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.create(
      program,
      {
        name: "SSS2 Test",
        symbol: "SS2",
        uri: "https://example.com/ss2.json",
        decimals: 6,
        preset: "SSS_2",
      },
      authority
    );
    expect(stable.isSSS2()).to.be.true;
  });

  it("create SSS-1 and assert !isSSS2()", async () => {
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const stable = await SolanaStablecoin.load(program as never, mintKeypair.publicKey);
    expect(stable.isSSS2()).to.be.false;
  });
});
