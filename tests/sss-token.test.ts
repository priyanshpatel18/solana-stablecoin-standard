import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import { expect } from "chai";
import {
  buildBurnTokensIx,
  buildFreezeAccountIx,
  buildInitializeIx,
  buildMintTokensIx,
  buildPauseIx,
  buildThawAccountIx,
  buildTransferAuthorityIx,
  buildUnpauseIx,
  buildUpdateMinterIx,
  buildUpdateRolesIx,
  createTokenAccount,
  findMinterPDA,
  findRolePDA,
  findStablecoinPDA,
  getTokenAccountAddress,
  sendAndConfirmAndLog,
  SSS_HOOK_PROGRAM_ID,
  SSS_TOKEN_PROGRAM_ID,
} from "./helpers";

describe("Simple Stablecoin Lifecycle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const connection = provider.connection;
  const authority = provider.wallet.payer as Keypair;

  // Test state
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let burnerKeypair: Keypair;
  let recipientKeypair: Keypair;
  let newAuthority: Keypair;
  let quotaTestMinter: Keypair;

  before(async () => {
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    burnerKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    newAuthority = Keypair.generate();
    quotaTestMinter = Keypair.generate();

    // Fund keypairs via SOL transfer from provider (economic: 0.1 SOL each)
    const LAMPORTS_PER_KEYPAIR = 100_000_000;
    const tx = new Transaction();
    for (const kp of [minterKeypair, burnerKeypair, recipientKeypair, newAuthority, quotaTestMinter]) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: kp.publicKey,
          lamports: LAMPORTS_PER_KEYPAIR,
        })
      );
    }
    await provider.sendAndConfirm(tx);

    console.log("Setup:");
    console.log("  Program ID:", SSS_TOKEN_PROGRAM_ID.toBase58());
    console.log("  Mint (will be created in first test):", mintKeypair.publicKey.toBase58());
  });

  describe("Initialize", () => {
    it("creates a stablecoin and stablecoin PDA is owned by program", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

      const ix = buildInitializeIx(
        authority.publicKey,
        stablecoinPDA,
        mintKeypair.publicKey,
        authorityRole,
        SSS_HOOK_PROGRAM_ID,
        {
          name: "Test USD",
          symbol: "TUSD",
          uri: "",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        }
      );

      const sig = await sendAndConfirmAndLog(
        connection,
        new Transaction().add(ix),
        [authority, mintKeypair],
        "Initialize tx"
      );

      const info = await connection.getAccountInfo(stablecoinPDA);
      expect(info).to.not.be.null;
      expect(info!.owner.equals(SSS_TOKEN_PROGRAM_ID)).to.be.true;
      expect(info!.data.length).to.be.greaterThan(0);
    });
  });

  describe("Roles", () => {
    it("assigns minter role and role account exists", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);

      const ix = buildUpdateRolesIx(
        authority.publicKey,
        stablecoinPDA,
        minterRole,
        minterKeypair.publicKey,
        {
          isMinter: true,
          isBurner: false,
          isPauser: false,
          isFreezer: false,
          isBlacklister: false,
          isSeizer: false,
        }
      );

      await sendAndConfirmAndLog(connection, new Transaction().add(ix), [authority], "Minter role");

      const info = await connection.getAccountInfo(minterRole);
      expect(info).to.not.be.null;
      console.log("  Minter role assigned");
    });

    it("sets minter quota and minter info account exists", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

      const ix = buildUpdateMinterIx(
        authority.publicKey,
        stablecoinPDA,
        minterInfo,
        minterKeypair.publicKey,
        BigInt(1_000_000)
      );

      await sendAndConfirmAndLog(connection, new Transaction().add(ix), [authority], "Minter quota");

      const info = await connection.getAccountInfo(minterInfo);
      expect(info).to.not.be.null;
      console.log("  Minter quota set");
    });
  });

  describe("Mint", () => {
    it("mints tokens to recipient and balance matches", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

      const recipientATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        recipientKeypair.publicKey
      );

      const amount = BigInt(500_000);
      const balanceBefore = await connection.getTokenAccountBalance(recipientATA);
      expect(balanceBefore.value.amount).to.equal("0");

      const ix = buildMintTokensIx(
        minterKeypair.publicKey,
        stablecoinPDA,
        minterRole,
        minterInfo,
        mintKeypair.publicKey,
        recipientATA,
        amount
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(ix), [minterKeypair], "Mint");

      const balanceAfter = await connection.getTokenAccountBalance(recipientATA);
      expect(balanceAfter.value.amount).to.equal(String(amount));
      console.log("  Minted:", amount.toString(), "; balance:", balanceAfter.value.amount);
    });
  });

  describe("Burn", () => {
    it("assigns burner role, mints to burner, burns half, balance is correct", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

      const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
      await sendAndConfirmAndLog(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            burnerRole,
            burnerKeypair.publicKey,
            {
              isMinter: true,
              isBurner: true,
              isPauser: false,
              isFreezer: false,
              isBlacklister: false,
              isSeizer: false,
            }
          )
        ),
        [authority],
        "Burner role"
      );

      const burnerATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        burnerKeypair.publicKey
      );

      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

      const mintAmount = BigInt(100_000);
      await sendAndConfirmAndLog(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            minterKeypair.publicKey,
            stablecoinPDA,
            minterRole,
            minterInfo,
            mintKeypair.publicKey,
            burnerATA,
            mintAmount
          )
        ),
        [minterKeypair],
        "Mint to burner"
      );

      const balanceBeforeBurn = await connection.getTokenAccountBalance(burnerATA);
      expect(balanceBeforeBurn.value.amount).to.equal(String(mintAmount));

      const burnAmount = BigInt(50_000);
      await sendAndConfirmAndLog(
        connection,
        new Transaction().add(
          buildBurnTokensIx(
            burnerKeypair.publicKey,
            stablecoinPDA,
            burnerRole,
            mintKeypair.publicKey,
            burnerATA,
            burnAmount
          )
        ),
        [burnerKeypair],
        "Burn"
      );

      const balanceAfterBurn = await connection.getTokenAccountBalance(burnerATA);
      const expectedRemaining = Number(mintAmount) - Number(burnAmount);
      expect(Number(balanceAfterBurn.value.amount)).to.equal(expectedRemaining);
      console.log("  Burned:", burnAmount.toString(), "; remaining:", balanceAfterBurn.value.amount);
    });
  });

  describe("Pause", () => {
    it("pauses then unpauses the stablecoin", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

      const pauseIx = buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole);
      await sendAndConfirmAndLog(connection, new Transaction().add(pauseIx), [authority], "Pause");
      console.log("  Stablecoin paused");

      const unpauseIx = buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole);
      await sendAndConfirmAndLog(connection, new Transaction().add(unpauseIx), [authority], "Unpause");
      console.log("  Stablecoin unpaused");
    });
  });

  describe("Freeze / Thaw", () => {
    it("freezes a token account then thaws it", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

      const recipientATA = await createTokenAccount(
        connection,
        authority,
        mintKeypair.publicKey,
        newAuthority.publicKey
      );

      const freezeIx = buildFreezeAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        recipientATA
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(freezeIx), [authority], "Freeze");
      console.log("  Account frozen");

      const thawIx = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        recipientATA
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(thawIx), [authority], "Thaw");
      console.log("  Account thawed");
    });
  });

  describe("Transfer Authority", () => {
    it("transfers authority to new key then back", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

      const ix = buildTransferAuthorityIx(
        authority.publicKey,
        stablecoinPDA,
        newAuthority.publicKey
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(ix), [authority], "Transfer authority");
      console.log("  Authority transferred to new key");

      const ix2 = buildTransferAuthorityIx(
        newAuthority.publicKey,
        stablecoinPDA,
        authority.publicKey
      );
      await sendAndConfirmAndLog(connection, new Transaction().add(ix2), [newAuthority], "Transfer authority back");
      console.log("  Authority transferred back");
    });
  });

  describe("Zero Amount Validation", () => {
    it("rejects mint with zero amount", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);

      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildMintTokensIx(
              minterKeypair.publicKey,
              stablecoinPDA,
              minterRole,
              minterInfo,
              mintKeypair.publicKey,
              recipientATA,
              BigInt(0)
            )
          ),
          [minterKeypair]
        );
        expect.fail("Should reject zero mint");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/ZeroAmount|Simulation failed|custom program error|0x/i);
        console.log("  Zero mint correctly rejected");
      }
    });

    it("rejects burn with zero amount", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
      const burnerATA = getTokenAccountAddress(mintKeypair.publicKey, burnerKeypair.publicKey);

      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildBurnTokensIx(
              burnerKeypair.publicKey,
              stablecoinPDA,
              burnerRole,
              mintKeypair.publicKey,
              burnerATA,
              BigInt(0)
            )
          ),
          [burnerKeypair]
        );
        expect.fail("Should reject zero burn");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/ZeroAmount|Simulation failed|custom program error|0x/i);
        console.log("  Zero burn correctly rejected");
      }
    });
  });

  describe("Error Cases", () => {
    it("rejects mint from non-minter", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [nonMinterRole] = findRolePDA(stablecoinPDA, newAuthority.publicKey);
      const [nonMinterInfo] = findMinterPDA(stablecoinPDA, newAuthority.publicKey);

      // Assign newAuthority a role without minter permission
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            nonMinterRole,
            newAuthority.publicKey,
            {
              isMinter: false,
              isBurner: false,
              isPauser: false,
              isFreezer: false,
              isBlacklister: false,
              isSeizer: false,
            }
          )
        ),
        [authority]
      );

      // Use existing recipient ATA from Mint test (avoid ATA create which can fail with "Provided owner is not allowed")
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);

      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildMintTokensIx(
              newAuthority.publicKey,
              stablecoinPDA,
              nonMinterRole,
              nonMinterInfo,
              mintKeypair.publicKey,
              recipientATA,
              BigInt(1)
            )
          ),
          [newAuthority]
        );
        expect.fail("Should reject mint from non-minter");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(
          msg,
          "expected tx to be rejected (e.g. Unauthorized or simulation failed)"
        ).to.match(/Unauthorized|invalid|missing|required|Simulation failed|custom program error|0x/i);
        console.log("  Mint from non-minter correctly rejected");
      }
    });

    it("rejects burn from non-burner", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [nonBurnerRole] = findRolePDA(stablecoinPDA, newAuthority.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            nonBurnerRole,
            newAuthority.publicKey,
            { isMinter: false, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ),
        [authority]
      );
      const nonBurnerATA = getTokenAccountAddress(mintKeypair.publicKey, newAuthority.publicKey);
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildBurnTokensIx(
              newAuthority.publicKey,
              stablecoinPDA,
              nonBurnerRole,
              mintKeypair.publicKey,
              nonBurnerATA,
              BigInt(1)
            )
          ),
          [newAuthority]
        );
        expect.fail("Should reject burn from non-burner");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|invalid|missing|required|Simulation failed|custom program error|0x/i);
      }
    });

    it("rejects pause from non-pauser", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [nonPauserRole] = findRolePDA(stablecoinPDA, newAuthority.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            nonPauserRole,
            newAuthority.publicKey,
            { isMinter: false, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ),
        [authority]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(buildPauseIx(newAuthority.publicKey, stablecoinPDA, nonPauserRole)),
          [newAuthority]
        );
        expect.fail("Should reject pause from non-pauser");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|invalid|Simulation failed|custom program error|0x/i);
      }
    });

    it("rejects update_roles from non-authority (role escalation)", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildUpdateRolesIx(
              newAuthority.publicKey,
              stablecoinPDA,
              authorityRole,
              authority.publicKey,
              { isMinter: true, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
            )
          ),
          [newAuthority]
        );
        expect.fail("Should reject update_roles from non-authority");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/constraint|Unauthorized|invalid|Simulation failed|custom program error|0x/i);
      }
    });

    it("rejects freeze from non-pauser", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [nonPauserRole] = findRolePDA(stablecoinPDA, newAuthority.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildFreezeAccountIx(
              newAuthority.publicKey,
              stablecoinPDA,
              nonPauserRole,
              mintKeypair.publicKey,
              recipientATA
            )
          ),
          [newAuthority]
        );
        expect.fail("Should reject freeze from non-pauser");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|invalid|Simulation failed|custom program error|0x/i);
      }
    });

    it("rejects thaw from non-pauser", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [nonPauserRole] = findRolePDA(stablecoinPDA, newAuthority.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildThawAccountIx(
              newAuthority.publicKey,
              stablecoinPDA,
              nonPauserRole,
              mintKeypair.publicKey,
              recipientATA
            )
          ),
          [newAuthority]
        );
        expect.fail("Should reject thaw from non-pauser");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|invalid|Simulation failed|custom program error|0x/i);
      }
    });
  });

  describe("Pause bypass", () => {
    it("after pause, mint fails", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);

      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole)),
        [authority]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildMintTokensIx(
              minterKeypair.publicKey,
              stablecoinPDA,
              minterRole,
              minterInfo,
              mintKeypair.publicKey,
              recipientATA,
              BigInt(1)
            )
          ),
          [minterKeypair]
        );
        expect.fail("Mint should fail when paused");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Paused|Simulation failed|custom program error|0x/i);
      }
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole)),
        [authority]
      );
    });

    it("after pause, burn fails", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
      const burnerATA = getTokenAccountAddress(mintKeypair.publicKey, burnerKeypair.publicKey);

      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole)),
        [authority]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildBurnTokensIx(
              burnerKeypair.publicKey,
              stablecoinPDA,
              burnerRole,
              mintKeypair.publicKey,
              burnerATA,
              BigInt(1)
            )
          ),
          [burnerKeypair]
        );
        expect.fail("Burn should fail when paused");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Paused|Simulation failed|custom program error|0x/i);
      }
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole)),
        [authority]
      );
    });
  });

  describe("Quota and supply", () => {
    it("rejects mint with amount exceeding quota", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [quotaTestMinterRole] = findRolePDA(stablecoinPDA, quotaTestMinter.publicKey);
      const [quotaTestMinterInfo] = findMinterPDA(stablecoinPDA, quotaTestMinter.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);

      // Use a fresh minter (quotaTestMinter) with no prior mints so we can set quota to 100
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            quotaTestMinterRole,
            quotaTestMinter.publicKey,
            {
              isMinter: true,
              isBurner: false,
              isPauser: false,
              isFreezer: false,
              isBlacklister: false,
              isSeizer: false,
            }
          )
        ),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateMinterIx(
            authority.publicKey,
            stablecoinPDA,
            quotaTestMinterInfo,
            quotaTestMinter.publicKey,
            BigInt(100)
          )
        ),
        [authority]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildMintTokensIx(
              quotaTestMinter.publicKey,
              stablecoinPDA,
              quotaTestMinterRole,
              quotaTestMinterInfo,
              mintKeypair.publicKey,
              recipientATA,
              BigInt(1000)
            )
          ),
          [quotaTestMinter]
        );
        expect.fail("Should reject mint exceeding quota");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/QuotaExceeded|Simulation failed|custom program error|0x/i);
      }
    });

    it("mint then burn then supply is consistent", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      const burnerATA = getTokenAccountAddress(mintKeypair.publicKey, burnerKeypair.publicKey);

      const supplyBefore = (await connection.getTokenSupply(mintKeypair.publicKey)).value.amount;

      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            findRolePDA(stablecoinPDA, minterKeypair.publicKey)[0],
            minterKeypair.publicKey,
            { isMinter: true, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ).add(
          buildUpdateMinterIx(
            authority.publicKey,
            stablecoinPDA,
            minterInfo,
            minterKeypair.publicKey,
            BigInt(1_000_000)
          )
        ),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            minterKeypair.publicKey,
            stablecoinPDA,
            minterRole,
            minterInfo,
            mintKeypair.publicKey,
            recipientATA,
            BigInt(50_000)
          )
        ),
        [minterKeypair]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            burnerRole,
            burnerKeypair.publicKey,
            { isMinter: true, isBurner: true, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            minterKeypair.publicKey,
            stablecoinPDA,
            minterRole,
            minterInfo,
            mintKeypair.publicKey,
            burnerATA,
            BigInt(20_000)
          )
        ),
        [minterKeypair]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildBurnTokensIx(
            burnerKeypair.publicKey,
            stablecoinPDA,
            burnerRole,
            mintKeypair.publicKey,
            burnerATA,
            BigInt(10_000)
          )
        ),
        [burnerKeypair]
      );
      const supplyAfter = (await connection.getTokenSupply(mintKeypair.publicKey)).value.amount;
      expect(Number(supplyAfter)).to.equal(Number(supplyBefore) + 50_000 + 20_000 - 10_000);
    });
  });

  describe("Lifecycle", () => {
    it("unpause then mint again succeeds", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);

      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole)),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole)),
        [authority]
      );
      const before = await connection.getTokenAccountBalance(recipientATA).catch(() => ({ value: { amount: "0" } }));
      const beforeAmount = Number(before.value.amount);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            minterKeypair.publicKey,
            stablecoinPDA,
            minterRole,
            minterInfo,
            mintKeypair.publicKey,
            recipientATA,
            BigInt(100)
          )
        ),
        [minterKeypair]
      );
      const after = await connection.getTokenAccountBalance(recipientATA);
      expect(Number(after.value.amount)).to.equal(beforeAmount + 100);
    });

    it("multiple mint batches update supply", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      const before = await connection.getTokenAccountBalance(recipientATA).catch(() => ({ value: { amount: "0" } }));
      const beforeAmount = Number(before.value.amount);

      for (const amount of [100, 200, 300]) {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildMintTokensIx(
              minterKeypair.publicKey,
              stablecoinPDA,
              minterRole,
              minterInfo,
              mintKeypair.publicKey,
              recipientATA,
              BigInt(amount)
            )
          ),
          [minterKeypair]
        );
      }
      const after = await connection.getTokenAccountBalance(recipientATA);
      expect(Number(after.value.amount)).to.equal(beforeAmount + 100 + 200 + 300);
    });

    it("multiple burn batches update supply", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
      const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
      const burnerATA = getTokenAccountAddress(mintKeypair.publicKey, burnerKeypair.publicKey);
      const bal = await connection.getTokenAccountBalance(burnerATA).catch(() => ({ value: { amount: "0" } }));
      const have = Number(bal.value.amount);
      if (have < 300) {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildMintTokensIx(
              minterKeypair.publicKey,
              stablecoinPDA,
              minterRole,
              minterInfo,
              mintKeypair.publicKey,
              burnerATA,
              BigInt(1000)
            )
          ),
          [minterKeypair]
        );
      }
      const before = await connection.getTokenAccountBalance(burnerATA);
      for (const amount of [50, 50, 50]) {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildBurnTokensIx(
              burnerKeypair.publicKey,
              stablecoinPDA,
              burnerRole,
              mintKeypair.publicKey,
              burnerATA,
              BigInt(amount)
            )
          ),
          [burnerKeypair]
        );
      }
      const after = await connection.getTokenAccountBalance(burnerATA);
      expect(Number(after.value.amount)).to.equal(Number(before.value.amount) - 150);
    });
  });

  describe("Freeze thaw edge cases", () => {
    it("freeze then thaw same account twice", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const targetATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      const freezeIx = buildFreezeAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        targetATA
      );
      const thawIx = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        targetATA
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(freezeIx), [authority]);
      await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);
      await sendAndConfirmTransaction(connection, new Transaction().add(freezeIx), [authority]);
      await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);
    });

    it("rejects thaw when not frozen", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildThawAccountIx(
              authority.publicKey,
              stablecoinPDA,
              authorityRole,
              mintKeypair.publicKey,
              recipientATA
            )
          ),
          [authority]
        );
        expect.fail("Thaw when not frozen should fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Account is not frozen|Simulation failed|custom program error|0x/i);
      }
    });

    it("rejects freeze when already frozen", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const targetATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildFreezeAccountIx(
            authority.publicKey,
            stablecoinPDA,
            authorityRole,
            mintKeypair.publicKey,
            targetATA
          )
        ),
        [authority]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildFreezeAccountIx(
              authority.publicKey,
              stablecoinPDA,
              authorityRole,
              mintKeypair.publicKey,
              targetATA
            )
          ),
          [authority]
        );
        expect.fail("Freeze when already frozen should fail");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Account is frozen|already frozen|Simulation failed|custom program error|0x/i);
      }
    });
  });

  describe("Authority transfer", () => {
    it("old authority cannot pause after transfer", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const [newAuthorityRole] = findRolePDA(stablecoinPDA, newAuthority.publicKey);

      await sendAndConfirmTransaction(
        connection,
        new Transaction()
          .add(
            buildUpdateRolesIx(
              authority.publicKey,
              stablecoinPDA,
              newAuthorityRole,
              newAuthority.publicKey,
              { isMinter: false, isBurner: false, isPauser: true, isFreezer: false, isBlacklister: false, isSeizer: false }
            )
          )
          .add(
            buildUpdateRolesIx(
              authority.publicKey,
              stablecoinPDA,
              authorityRole,
              authority.publicKey,
              { isMinter: false, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
            )
          ),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildTransferAuthorityIx(authority.publicKey, stablecoinPDA, newAuthority.publicKey)),
        [authority]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole)),
          [authority]
        );
        expect.fail("Old authority should not be able to pause");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|constraint|Simulation failed|custom program error|0x|2003/i);
      }
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildTransferAuthorityIx(newAuthority.publicKey, stablecoinPDA, authority.publicKey)),
        [newAuthority]
      );
    });

    it("new authority can pause after transfer", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [newAuthorityRole] = findRolePDA(stablecoinPDA, newAuthority.publicKey);

      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            newAuthorityRole,
            newAuthority.publicKey,
            { isMinter: false, isBurner: false, isPauser: true, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildTransferAuthorityIx(authority.publicKey, stablecoinPDA, newAuthority.publicKey)),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildPauseIx(newAuthority.publicKey, stablecoinPDA, newAuthorityRole)),
        [newAuthority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildUnpauseIx(newAuthority.publicKey, stablecoinPDA, newAuthorityRole)),
        [newAuthority]
      );
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            newAuthority.publicKey,
            stablecoinPDA,
            authorityRole,
            authority.publicKey,
            { isMinter: false, isBurner: false, isPauser: true, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ),
        [newAuthority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(buildTransferAuthorityIx(newAuthority.publicKey, stablecoinPDA, authority.publicKey)),
        [newAuthority]
      );
    });
  });

  describe("Roles isolation", () => {
    it("grant only burner: mint fails, burn succeeds", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildThawAccountIx(
            authority.publicKey,
            stablecoinPDA,
            authorityRole,
            mintKeypair.publicKey,
            recipientATA
          )
        ),
        [authority]
      ).catch(() => {});
      const [burnerOnlyRole] = findRolePDA(stablecoinPDA, recipientKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, recipientKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            burnerOnlyRole,
            recipientKeypair.publicKey,
            { isMinter: false, isBurner: true, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ),
        [authority]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildMintTokensIx(
              recipientKeypair.publicKey,
              stablecoinPDA,
              burnerOnlyRole,
              minterInfo,
              mintKeypair.publicKey,
              recipientATA,
              BigInt(1)
            )
          ),
          [recipientKeypair]
        );
        expect.fail("Burner-only should not mint");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|Simulation failed|custom program error|0x/i);
      }
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            minterKeypair.publicKey,
            stablecoinPDA,
            findRolePDA(stablecoinPDA, minterKeypair.publicKey)[0],
            findMinterPDA(stablecoinPDA, minterKeypair.publicKey)[0],
            mintKeypair.publicKey,
            recipientATA,
            BigInt(100)
          )
        ),
        [minterKeypair]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildBurnTokensIx(
            recipientKeypair.publicKey,
            stablecoinPDA,
            burnerOnlyRole,
            mintKeypair.publicKey,
            recipientATA,
            BigInt(50)
          )
        ),
        [recipientKeypair]
      );
      const after = await connection.getTokenAccountBalance(recipientATA);
      expect(Number(after.value.amount)).to.be.greaterThanOrEqual(0);
    });

    it("grant only minter (no burner): burn fails", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
      const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
      const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildThawAccountIx(
            authority.publicKey,
            stablecoinPDA,
            authorityRole,
            mintKeypair.publicKey,
            recipientATA
          )
        ),
        [authority]
      ).catch(() => {});
      const [minterOnlyRole] = findRolePDA(stablecoinPDA, recipientKeypair.publicKey);
      const [minterInfo] = findMinterPDA(stablecoinPDA, recipientKeypair.publicKey);
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateRolesIx(
            authority.publicKey,
            stablecoinPDA,
            minterOnlyRole,
            recipientKeypair.publicKey,
            { isMinter: true, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false }
          )
        ),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildUpdateMinterIx(
            authority.publicKey,
            stablecoinPDA,
            minterInfo,
            recipientKeypair.publicKey,
            BigInt(1000)
          )
        ),
        [authority]
      );
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            recipientKeypair.publicKey,
            stablecoinPDA,
            minterOnlyRole,
            minterInfo,
            mintKeypair.publicKey,
            recipientATA,
            BigInt(100)
          )
        ),
        [recipientKeypair]
      );
      try {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            buildBurnTokensIx(
              recipientKeypair.publicKey,
              stablecoinPDA,
              minterOnlyRole,
              mintKeypair.publicKey,
              recipientATA,
              BigInt(10)
            )
          ),
          [recipientKeypair]
        );
        expect.fail("Minter-only should not burn");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).to.match(/Unauthorized|Simulation failed|custom program error|0x/i);
      }
    });
  });
});
