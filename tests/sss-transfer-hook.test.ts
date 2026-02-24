import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  buildAddToBlacklistIx,
  buildInitializeExtraAccountMetaListIx,
  buildInitializeIx,
  buildMintTokensIx,
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
  SSS_HOOK_PROGRAM_ID,
  SSS_TOKEN_PROGRAM_ID,
} from "./helpers";

describe("Stablecoin with Transfer Hook", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");

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

    for (const kp of [
      authority,
      minterKeypair,
      blacklisterKeypair,
      seizerKeypair,
      userKeypair,
      badActorKeypair,
    ]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }

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
      await sendAndConfirmTransaction(connection, tx, [authority, mintKeypair]);

      const info = await connection.getAccountInfo(stablecoinPDA);
      expect(info).to.not.be.null;
      console.log("  Stablecoin PDA:", stablecoinPDA.toBase58());
    });
  });

  describe("Compliance Roles", () => {
    it("assigns minter, blacklister, seizer and sets minter quota", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      await sendAndConfirmTransaction(
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
        [authority]
      );

      const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
      await sendAndConfirmTransaction(
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
        [authority]
      );

      const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);
      await sendAndConfirmTransaction(
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
        [authority]
      );

      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      await sendAndConfirmTransaction(
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
        [authority]
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
      await sendAndConfirmTransaction(connection, new Transaction().add(initExtraIx), [authority]);
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
      await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);

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
      await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);

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

      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [blacklisterKeypair]);

      const info = await connection.getAccountInfo(blacklistEntry);
      expect(info).to.not.be.null;
      expect(info!.data.length).to.be.greaterThan(0);
      console.log("  Blacklist entry created for:", badActorKeypair.publicKey.toBase58().slice(0, 8) + "...");
    });
  });

  describe("Seize", () => {
    it("seizes tokens from blacklisted account to treasury; source zero, dest increased", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);

      // Create and fund bad actor ATA (simulates pre-blacklist balance)
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
      await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);

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
      await sendAndConfirmTransaction(connection, new Transaction().add(thawTreasuryIx), [authority]);

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
      await sendAndConfirmTransaction(connection, new Transaction().add(seizeIx), [seizerKeypair]);

      const badActorBalance = await connection.getTokenAccountBalance(badActorATA);
      expect(badActorBalance.value.amount).to.equal("0");

      const treasuryBalance = await connection.getTokenAccountBalance(treasuryATA);
      expect(Number(treasuryBalance.value.amount)).to.be.greaterThan(0);
      console.log("  Seized to treasury:", treasuryBalance.value.amount);
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
