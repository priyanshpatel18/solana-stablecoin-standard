import { Keypair, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import {
  buildBurnTokensIx,
  buildFreezeAccountIx,
  buildInitializeIx,
  buildMintTokensIx,
  buildPauseIx,
  buildThawAccountIx,
  buildUnpauseIx,
  buildUpdateMinterIx,
  buildUpdateRolesIx,
  createTokenAccount,
  findMinterPDA,
  findRolePDA,
  findStablecoinPDA,
  sendAndConfirmAndLog,
  SSS_HOOK_PROGRAM_ID,
  SSS_TOKEN_PROGRAM_ID,
} from "./helpers";
import { fundKeypairs, getProvider } from "./testSetup";

describe("SSS-1 Lifecycle", () => {
  const provider = getProvider();
  const connection = provider.connection;
  const authority = provider.wallet.payer as Keypair;

  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let burnerKeypair: Keypair;
  let recipientKeypair: Keypair;
  let otherKeypair: Keypair;

  before(async () => {
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    burnerKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    otherKeypair = Keypair.generate();
    await fundKeypairs(provider, [minterKeypair, burnerKeypair, recipientKeypair, otherKeypair]);
  });

  it("creates SSS-1 stablecoin (init)", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const ix = buildInitializeIx(
      authority.publicKey,
      stablecoinPDA,
      mintKeypair.publicKey,
      authorityRole,
      SSS_HOOK_PROGRAM_ID,
      { name: "Test USD", symbol: "TUSD", uri: "", decimals: 6, enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false }
    );
    await sendAndConfirmAndLog(connection, new Transaction().add(ix), [authority, mintKeypair], "Initialize");
    const info = await connection.getAccountInfo(stablecoinPDA);
    expect(info).to.not.be.null;
    expect(info!.owner.equals(SSS_TOKEN_PROGRAM_ID)).to.be.true;
  });

  it("assigns minter role and quota", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, minterRole, minterKeypair.publicKey, { isMinter: true, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false })
      ),
      [authority],
      "Minter role"
    );
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(1_000_000))),
      [authority],
      "Minter quota"
    );
  });

  it("mints tokens to recipient", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, recipientKeypair.publicKey);
    const amount = BigInt(500_000);
    const ix = buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, recipientATA, amount);
    await sendAndConfirmAndLog(connection, new Transaction().add(ix), [minterKeypair], "Mint");
    const balance = await connection.getTokenAccountBalance(recipientATA);
    expect(balance.value.amount).to.equal(String(amount));
  });

  it("assigns burner role, mints to burner, burns half", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, burnerRole, burnerKeypair.publicKey, { isMinter: true, isBurner: true, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false })
      ),
      [authority],
      "Burner role"
    );

    const burnerATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, burnerKeypair.publicKey);
    const mintAmount = BigInt(100_000);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, burnerATA, mintAmount)),
      [minterKeypair],
      "Mint to burner"
    );

    const burnAmount = BigInt(50_000);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(buildBurnTokensIx(burnerKeypair.publicKey, stablecoinPDA, burnerRole, mintKeypair.publicKey, burnerATA, burnAmount)),
      [burnerKeypair],
      "Burn"
    );

    const balance = await connection.getTokenAccountBalance(burnerATA);
    expect(Number(balance.value.amount)).to.equal(Number(mintAmount) - Number(burnAmount));
  });

  it("pauses then unpauses", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    await sendAndConfirmAndLog(connection, new Transaction().add(buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole)), [authority], "Pause");
    await sendAndConfirmAndLog(connection, new Transaction().add(buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole)), [authority], "Unpause");
  });

  it("freezes then thaws account", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const otherATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, otherKeypair.publicKey);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(buildFreezeAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, otherATA)),
      [authority],
      "Freeze"
    );
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, otherATA)),
      [authority],
      "Thaw"
    );
  });
});
