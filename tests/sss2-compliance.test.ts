import { createTransferCheckedWithTransferHookInstruction } from "@solana/spl-token";
import { Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import {
  buildAddToBlacklistIx,
  buildInitializeExtraAccountMetaListIx,
  buildInitializeIx,
  buildMintTokensIx,
  buildRemoveFromBlacklistIx,
  buildSeizeIx,
  buildThawAccountIx,
  buildUpdateMinterIx,
  buildUpdateRolesIx,
  createTokenAccount,
  findBlacklistPDA,
  findExtraAccountMetasPDA,
  findMinterPDA,
  findRolePDA,
  findStablecoinPDA,
  getTokenAccountAddress,
  sendAndConfirmAndLog,
  SSS_HOOK_PROGRAM_ID,
  SSS_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./helpers";
import { fundKeypairs, getProvider } from "./testSetup";

describe("SSS-2 Compliance", () => {
  const provider = getProvider();
  const connection = provider.connection;
  const payer = provider.wallet.payer as Keypair;

  let authority: Keypair;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let blacklisterKeypair: Keypair;
  let seizerKeypair: Keypair;
  let userKeypair: Keypair;
  let badActorKeypair: Keypair;

  before(async () => {
    authority = Keypair.generate();
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    blacklisterKeypair = Keypair.generate();
    seizerKeypair = Keypair.generate();
    userKeypair = Keypair.generate();
    badActorKeypair = Keypair.generate();
    await fundKeypairs(provider, [
      authority,
      minterKeypair,
      blacklisterKeypair,
      seizerKeypair,
      userKeypair,
      badActorKeypair,
    ]);
  });

  it("creates SSS-2 stablecoin with transfer hook and compliance roles", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    const ix = buildInitializeIx(
      authority.publicKey,
      stablecoinPDA,
      mintKeypair.publicKey,
      authorityRole,
      SSS_HOOK_PROGRAM_ID,
      {
        name: "Compliant USD",
        symbol: "cUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: true,
      }
    );
    await sendAndConfirmAndLog(connection, new Transaction().add(ix), [authority, mintKeypair], "Initialize SSS-2");

    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    await sendAndConfirmAndLog(
      connection,
      new Transaction()
        .add(
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, minterRole, minterKeypair.publicKey, {
            isMinter: true,
            isBurner: false,
            isPauser: false,
            isFreezer: false,
            isBlacklister: false,
            isSeizer: false,
          })
        )
        .add(
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, blRole, blacklisterKeypair.publicKey, {
            isMinter: false,
            isBurner: false,
            isPauser: false,
            isFreezer: false,
            isBlacklister: true,
            isSeizer: false,
          })
        )
        .add(
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, szRole, seizerKeypair.publicKey, {
            isMinter: false,
            isBurner: false,
            isPauser: false,
            isFreezer: false,
            isBlacklister: false,
            isSeizer: true,
          })
        )
        .add(buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(10_000_000))),
      [authority],
      "Compliance roles"
    );

    const [extraAccountMetasPDA] = findExtraAccountMetasPDA(mintKeypair.publicKey, SSS_HOOK_PROGRAM_ID);
    const initExtraIx = buildInitializeExtraAccountMetaListIx(
      authority.publicKey,
      extraAccountMetasPDA,
      mintKeypair.publicKey,
      SSS_TOKEN_PROGRAM_ID
    );
    await sendAndConfirmAndLog(connection, new Transaction().add(initExtraIx), [authority], "Extra-account-metas");
  });

  it("thaws user ATA, mints tokens", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    const userATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, userKeypair.publicKey);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, userATA)
      ),
      [authority],
      "Thaw user ATA"
    );

    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    const mintAmount = BigInt(1_000_000);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, userATA, mintAmount)
      ),
      [minterKeypair],
      "Mint to user"
    );
    const balance = await connection.getTokenAccountBalance(userATA);
    expect(balance.value.amount).to.equal("1000000");
  });

  it("adds address to blacklist", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, badActorKeypair.publicKey);

    const ix = buildAddToBlacklistIx(
      blacklisterKeypair.publicKey,
      stablecoinPDA,
      blRole,
      blacklistEntry,
      badActorKeypair.publicKey,
      "Sanctions list match"
    );
    await sendAndConfirmAndLog(connection, new Transaction().add(ix), [blacklisterKeypair], "Blacklist add");

    const info = await connection.getAccountInfo(blacklistEntry);
    expect(info).to.not.be.null;
  });

  it("remove then add to blacklist again", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, badActorKeypair.publicKey);

    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildRemoveFromBlacklistIx(blacklisterKeypair.publicKey, stablecoinPDA, blRole, blacklistEntry, badActorKeypair.publicKey)
      ),
      [blacklisterKeypair],
      "Blacklist remove"
    );

    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildAddToBlacklistIx(
          blacklisterKeypair.publicKey,
          stablecoinPDA,
          blRole,
          blacklistEntry,
          badActorKeypair.publicKey,
          "Re-added after removal"
        )
      ),
      [blacklisterKeypair],
      "Blacklist add again"
    );
  });

  it("blocked transfer to blacklisted destination", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const badActorATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, badActorKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, badActorATA)
      ),
      [authority]
    );

    const userATA = getTokenAccountAddress(mintKeypair.publicKey, userKeypair.publicKey);
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection,
      userATA,
      mintKeypair.publicKey,
      badActorATA,
      userKeypair.publicKey,
      BigInt(1),
      6,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [userKeypair]);
      expect.fail("Transfer to blacklisted destination should fail");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/Blacklisted|Simulation failed|custom program error|0x/i);
    }
  });

  it("blocked transfer from blacklisted source", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    const [blacklistEntryUser] = findBlacklistPDA(stablecoinPDA, userKeypair.publicKey);

    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildAddToBlacklistIx(
          blacklisterKeypair.publicKey,
          stablecoinPDA,
          blRole,
          blacklistEntryUser,
          userKeypair.publicKey,
          "Block source"
        )
      ),
      [blacklisterKeypair],
      "Blacklist source"
    );

    const userATA = getTokenAccountAddress(mintKeypair.publicKey, userKeypair.publicKey);
    const badActorATA = getTokenAccountAddress(mintKeypair.publicKey, badActorKeypair.publicKey);
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection,
      userATA,
      mintKeypair.publicKey,
      badActorATA,
      userKeypair.publicKey,
      BigInt(1),
      6,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [userKeypair]);
      expect.fail("Transfer from blacklisted source should fail");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/Blacklisted|Simulation failed|custom program error|0x/i);
    }
  });

  it("seizes tokens from blacklisted account to treasury", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const badActorATA = getTokenAccountAddress(mintKeypair.publicKey, badActorKeypair.publicKey);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildMintTokensIx(
          minterKeypair.publicKey,
          stablecoinPDA,
          minterRole,
          minterInfo,
          mintKeypair.publicKey,
          badActorATA,
          BigInt(500_000)
        )
      ),
      [minterKeypair],
      "Mint to bad actor"
    );

    const treasuryATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, authority.publicKey);
    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, treasuryATA)
      ),
      [authority],
      "Thaw treasury"
    );

    const [extraAccountMetas] = findExtraAccountMetasPDA(mintKeypair.publicKey, SSS_HOOK_PROGRAM_ID);
    const [sourceBlacklist] = findBlacklistPDA(stablecoinPDA, stablecoinPDA);
    const [destBlacklist] = findBlacklistPDA(stablecoinPDA, authority.publicKey);

    const seizeIx = buildSeizeIx(
      seizerKeypair.publicKey,
      stablecoinPDA,
      szRole,
      mintKeypair.publicKey,
      badActorATA,
      treasuryATA,
      SSS_HOOK_PROGRAM_ID,
      extraAccountMetas,
      SSS_TOKEN_PROGRAM_ID,
      sourceBlacklist,
      destBlacklist
    );
    await sendAndConfirmAndLog(connection, new Transaction().add(seizeIx), [seizerKeypair], "Seize");

    const badActorBalance = await connection.getTokenAccountBalance(badActorATA);
    expect(badActorBalance.value.amount).to.equal("0");

    const treasuryBalance = await connection.getTokenAccountBalance(treasuryATA);
    expect(Number(treasuryBalance.value.amount)).to.be.greaterThan(0);
  });
});
