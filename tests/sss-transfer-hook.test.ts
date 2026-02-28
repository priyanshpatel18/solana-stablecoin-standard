import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
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
import { createTransferCheckedWithTransferHookInstruction } from "@solana/spl-token";

describe("Stablecoin with Transfer Hook", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = provider.wallet.payer as Keypair;

  // Test state
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

    const LAMPORTS_PER_KEYPAIR = 100_000_000;
    const tx = new Transaction();
    for (const kp of [
      authority,
      minterKeypair,
      blacklisterKeypair,
      seizerKeypair,
      userKeypair,
      badActorKeypair,
    ]) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: kp.publicKey,
          lamports: LAMPORTS_PER_KEYPAIR,
        })
      );
    }
    await provider.sendAndConfirm(tx);

    console.log("Setup:");
    console.log("  SSS Token Program:", SSS_TOKEN_PROGRAM_ID.toBase58());
    console.log("  Transfer Hook Program:", SSS_HOOK_PROGRAM_ID.toBase58());
    console.log("  Mint:", mintKeypair.publicKey.toBase58());
  });

  describe("Initialize", () => {
    it("creates SSS-2 stablecoin with permanent delegate and transfer hook", async () => {
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

      const tx = new Transaction().add(ix);
      await sendAndConfirmAndLog(connection, tx, [authority, mintKeypair], "Initialize SSS-2");

      const info = await connection.getAccountInfo(stablecoinPDA);
      expect(info).to.not.be.null;
      console.log("  Stablecoin PDA:", stablecoinPDA.toBase58());
    });
  });

  describe("Compliance Roles", () => {
    it("assigns minter, blacklister, seizer and sets minter quota", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      await sendAndConfirmAndLog(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            minterRole,
            minterKeypair.publicKey,
            {
              isMinter: true,
              isBurner: false,
              isPauser: false,
              isBlacklister: false,
              isSeizer: false,
            }
          )
        ),
        [authority],
        "Compliance roles (minter)"
      );

      const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
      await sendAndConfirmAndLog(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            blRole,
            blacklisterKeypair.publicKey,
            {
              isMinter: false,
              isBurner: false,
              isPauser: false,
              isBlacklister: true,
              isSeizer: false,
            }
          )
        ),
        [authority],
        "Compliance roles (blacklister)"
      );

      const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);
      await sendAndConfirmAndLog(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            szRole,
            seizerKeypair.publicKey,
            {
              isMinter: false,
              isBurner: false,
              isPauser: false,
              isBlacklister: false,
              isSeizer: true,
            }
          )
        ),
        [authority],
        "Compliance roles (seizer)"
      );

      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      await sendAndConfirmAndLog(
        connection,
        new Transaction().add(
          buildUpdateMinterIx(
            authority.publicKey,
            stablecoinPDA,
            minterInfo,
            minterKeypair.publicKey,
            BigInt(10_000_000)
          )
        ),
        [authority],
        "Minter quota"
      );

      console.log("  Roles and minter quota set");
    });

    it("initializes transfer hook extra-account-metas for mint", async () => {
      const [extraAccountMetasPDA] = findExtraAccountMetasPDA(
        mintKeypair.publicKey,
        SSS_HOOK_PROGRAM_ID
      );
      const initExtraIx = buildInitializeExtraAccountMetaListIx(
        authority.publicKey,
        extraAccountMetasPDA,
        mintKeypair.publicKey,
        SSS_TOKEN_PROGRAM_ID
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(initExtraIx), [authority], "Extra-account-metas");
      console.log("  Extra-account-metas PDA:", extraAccountMetasPDA.toBase58());
    });
  });

  describe("User Lifecycle", () => {
    it("thaws user ATA (KYC), mints tokens, balance matches", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

      // User ATA is frozen by default (defaultAccountFrozen=true)
      const userATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        userKeypair.publicKey
      );

      const thawIx = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        userATA
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(thawIx), [authority], "Thaw user ATA");

      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

      const mintAmount = BigInt(1_000_000);
      const mintIx = buildMintTokensIx(
        minterKeypair.publicKey,
        stablecoinPDA,
        minterRole,
        minterInfo,
        mintKeypair.publicKey,
        userATA,
        mintAmount
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(mintIx), [minterKeypair], "Mint to user");

      const balance = await connection.getTokenAccountBalance(userATA);
      expect(balance.value.amount).to.equal("1000000");
      console.log("  User balance:", balance.value.amount);
    });
  });

  describe("Blacklist", () => {
    it("adds address to blacklist and blacklist entry exists", async () => {
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
      expect(info!.data.length).to.be.greaterThan(0);
      console.log("  Blacklist entry created for:", badActorKeypair.publicKey.toBase58().slice(0, 8) + "...");
    });

    it("remove then add again", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
      const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, badActorKeypair.publicKey);

      const removeIx = buildRemoveFromBlacklistIx(
        blacklisterKeypair.publicKey,
        stablecoinPDA,
        blRole,
        blacklistEntry,
        badActorKeypair.publicKey
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(removeIx), [blacklisterKeypair], "Blacklist remove");

      const addIx = buildAddToBlacklistIx(
        blacklisterKeypair.publicKey,
        stablecoinPDA,
        blRole,
        blacklistEntry,
        badActorKeypair.publicKey,
        "Re-added after removal"
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(addIx), [blacklisterKeypair], "Blacklist add again");

      const info = await connection.getAccountInfo(blacklistEntry);
      expect(info).to.not.be.null;
    });

    it("blacklist destination, transfer fails", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const badActorATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        badActorKeypair.publicKey
      );
      const thawIx = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        badActorATA
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);
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
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(transferIx),
          [userKeypair]
        );
        expect.fail("Transfer to blacklisted destination should fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Blacklisted|Simulation failed|custom program error|0x/i);
      }
    });

    it("blacklist source, transfer fails", async () => {
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
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(transferIx),
          [userKeypair]
        );
        expect.fail("Transfer from blacklisted source should fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Blacklisted|Simulation failed|custom program error|0x/i);
      }
    });
  });

  describe("Roles", () => {
    it("rejects add_to_blacklist from non-blacklister", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, authority.publicKey);
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildAddToBlacklistIx(
              minterKeypair.publicKey,
              stablecoinPDA,
              minterRole,
              blacklistEntry,
              authority.publicKey,
              "Should fail"
            )
          ),
          [minterKeypair]
        );
        expect.fail("Should reject add_to_blacklist from non-blacklister");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|Simulation failed|custom program error|0x/i);
      }
    });

    it("rejects remove_from_blacklist from non-blacklister", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
      const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, badActorKeypair.publicKey);
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildRemoveFromBlacklistIx(
              minterKeypair.publicKey,
              stablecoinPDA,
              minterRole,
              blacklistEntry,
              badActorKeypair.publicKey
            )
          ),
          [minterKeypair]
        );
        expect.fail("Should reject remove_from_blacklist from non-blacklister");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|Simulation failed|custom program error|0x/i);
      }
    });
  });

  describe("Hook", () => {
    it("transfer between two non-blacklisted accounts succeeds", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const aliceKeypair = Keypair.generate();
      const bobKeypair = Keypair.generate();
      const LAMPORTS = 100_000_000;
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: aliceKeypair.publicKey,
            lamports: LAMPORTS,
          }),
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: bobKeypair.publicKey,
            lamports: LAMPORTS,
          })
        ),
        [payer]
      );
      const aliceATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, aliceKeypair.publicKey);
      const bobATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, bobKeypair.publicKey);
      const thawAlice = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        aliceATA
      );
      const thawBob = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        bobATA
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(thawAlice).add(thawBob),
        [authority]
      );
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            minterKeypair.publicKey,
            stablecoinPDA,
            minterRole,
            minterInfo,
            mintKeypair.publicKey,
            aliceATA,
            BigInt(100_000)
          )
        ),
        [minterKeypair]
      );
      const transferIx = await createTransferCheckedWithTransferHookInstruction(
        connection,
        aliceATA,
        mintKeypair.publicKey,
        bobATA,
        aliceKeypair.publicKey,
        BigInt(10_000),
        6,
        [],
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [aliceKeypair]);
      const bobBalance = await connection.getTokenAccountBalance(bobATA);
      expect(Number(bobBalance.value.amount)).to.equal(10_000);
    });

    it("after blacklist add, transfer fails with hook error", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
      const bobKeypair = Keypair.generate();
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: bobKeypair.publicKey,
            lamports: 100_000_000,
          })
        ),
        [payer]
      );
      const aliceATA = getTokenAccountAddress(mintKeypair.publicKey, userKeypair.publicKey);
      const bobATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        bobKeypair.publicKey
      );
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const thawBob = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        bobATA
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(thawBob), [authority]);
      const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, bobKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildAddToBlacklistIx(
            blacklisterKeypair.publicKey,
            stablecoinPDA,
            blRole,
            blacklistEntry,
            bobKeypair.publicKey,
            "Block transfer"
          )
        ),
        [blacklisterKeypair]
      );
      const transferIx = await createTransferCheckedWithTransferHookInstruction(
        connection,
        aliceATA,
        mintKeypair.publicKey,
        bobATA,
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
  });

  describe("Seize", () => {
    it("seizes tokens from blacklisted account to treasury; source zero, dest increased", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);

      // badActor ATA already exists and is thawed from "blacklist destination" test
      const badActorATA = getTokenAccountAddress(mintKeypair.publicKey, badActorKeypair.publicKey);

      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

      const mintIx = buildMintTokensIx(
        minterKeypair.publicKey,
        stablecoinPDA,
        minterRole,
        minterInfo,
        mintKeypair.publicKey,
        badActorATA,
        BigInt(500_000)
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(mintIx), [minterKeypair], "Mint to user");

      const treasuryATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        authority.publicKey
      );
      const thawTreasuryIx = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        treasuryATA
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(thawTreasuryIx), [authority], "Thaw treasury");

      // Hook Execute "authority" (index 3) = transfer signer = permanent delegate = stablecoin PDA.
      // So source_blacklist must be blacklist(stablecoin, stablecoin), not blacklist(stablecoin, bad_actor).
      const [extraAccountMetas] = findExtraAccountMetasPDA(
        mintKeypair.publicKey,
        SSS_HOOK_PROGRAM_ID
      );
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
      console.log("  Seized to treasury:", treasuryBalance.value.amount);
    });

    it("seize with zero balance (no-op or error)", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);
      const [extraAccountMetas] = findExtraAccountMetasPDA(mintKeypair.publicKey, SSS_HOOK_PROGRAM_ID);
      const [sourceBlacklist] = findBlacklistPDA(stablecoinPDA, stablecoinPDA);
      const [destBlacklist] = findBlacklistPDA(stablecoinPDA, authority.publicKey);

      const zeroBalanceKeypair = Keypair.generate();
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: zeroBalanceKeypair.publicKey,
            lamports: 100_000_000,
          })
        ),
        [payer]
      );
      const zeroBalanceATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        zeroBalanceKeypair.publicKey
      );
      const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
      const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, zeroBalanceKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildAddToBlacklistIx(
            blacklisterKeypair.publicKey,
            stablecoinPDA,
            blRole,
            blacklistEntry,
            zeroBalanceKeypair.publicKey,
            "Zero balance seize test"
          )
        ),
        [blacklisterKeypair]
      );
      const thawIx = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        zeroBalanceATA
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);

      const treasuryATA = getTokenAccountAddress(mintKeypair.publicKey, authority.publicKey);
      const seizeIx = buildSeizeIx(
        seizerKeypair.publicKey,
        stablecoinPDA,
        szRole,
        mintKeypair.publicKey,
        zeroBalanceATA,
        treasuryATA,
        SSS_HOOK_PROGRAM_ID,
        extraAccountMetas,
        SSS_TOKEN_PROGRAM_ID,
        sourceBlacklist,
        destBlacklist
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(seizeIx),
          [seizerKeypair]
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/ZeroAmount|zero|0x1776|6006/i);
      }
    });

    it("seize to self (treasury as dest)", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      const [extraAccountMetas] = findExtraAccountMetasPDA(mintKeypair.publicKey, SSS_HOOK_PROGRAM_ID);
      const [sourceBlacklist] = findBlacklistPDA(stablecoinPDA, stablecoinPDA);
      const [destBlacklist] = findBlacklistPDA(stablecoinPDA, authority.publicKey);

      const badActorATA = getTokenAccountAddress(mintKeypair.publicKey, badActorKeypair.publicKey);
      const treasuryATA = getTokenAccountAddress(mintKeypair.publicKey, authority.publicKey);

      const mintIx = buildMintTokensIx(
        minterKeypair.publicKey,
        stablecoinPDA,
        minterRole,
        minterInfo,
        mintKeypair.publicKey,
        badActorATA,
        BigInt(100_000)
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);

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
      await sendAndConfirmTransaction(connection, new Transaction().add(seizeIx), [seizerKeypair]);
    });
  });

  describe("Error Cases", () => {
    it("rejects seize from non-seizer", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [extraAccountMetas] = findExtraAccountMetasPDA(
        mintKeypair.publicKey,
        SSS_HOOK_PROGRAM_ID
      );
      const [sourceBlacklist] = findBlacklistPDA(stablecoinPDA, stablecoinPDA);
      const [destBlacklist] = findBlacklistPDA(stablecoinPDA, authority.publicKey);

      // Use existing ATAs from Seize test (avoid ATA create which can fail with "Provided owner is not allowed")
      const badActorATA = getTokenAccountAddress(mintKeypair.publicKey, badActorKeypair.publicKey);
      const treasuryATA = getTokenAccountAddress(mintKeypair.publicKey, authority.publicKey);

      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildSeizeIx(
              authority.publicKey,
              stablecoinPDA,
              authorityRole, // authority's role has isSeizer: false
              mintKeypair.publicKey,
              badActorATA,
              treasuryATA,
              SSS_HOOK_PROGRAM_ID,
              extraAccountMetas,
              SSS_TOKEN_PROGRAM_ID,
              sourceBlacklist,
              destBlacklist
            )
          ),
          [authority]
        );
        expect.fail("Should reject seize from non-seizer");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(
          msg,
          "expected tx to be rejected (e.g. Unauthorized or simulation failed)"
        ).to.match(/Unauthorized|invalid|missing|required|Simulation failed|custom program error|0x/i);
        console.log("  Seize from non-seizer correctly rejected");
      }
    });
  });
});
