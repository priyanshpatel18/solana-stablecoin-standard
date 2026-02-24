import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  findStablecoinPDA,
  findRolePDA,
  findMinterPDA,
  buildInitializeIx,
  buildUpdateRolesIx,
  buildUpdateMinterIx,
  buildMintTokensIx,
  buildBurnTokensIx,
  buildPauseIx,
  buildUnpauseIx,
  buildFreezeAccountIx,
  buildThawAccountIx,
  buildTransferAuthorityIx,
  createTokenAccount,
  getTokenAccountAddress,
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

  before(async () => {
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    burnerKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    newAuthority = Keypair.generate();

    // Fund keypairs via SOL transfer (more reliable than airdrop in CI)
    const tx = new Transaction();
    for (const kp of [minterKeypair, burnerKeypair, recipientKeypair, newAuthority]) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: kp.publicKey,
          lamports: 10 * LAMPORTS_PER_SOL,
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

      const sig = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(ix),
        [authority, mintKeypair]
      );
      console.log("  Initialize tx:", sig);

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
          isBlacklister: false,
          isSeizer: false,
        }
      );

      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority]);

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

      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority]);

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
      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [minterKeypair]);

      const balanceAfter = await connection.getTokenAccountBalance(recipientATA);
      expect(balanceAfter.value.amount).to.equal(String(amount));
      console.log("  Minted:", amount.toString(), "; balance:", balanceAfter.value.amount);
    });
  });

  describe("Burn", () => {
    it("assigns burner role, mints to burner, burns half, balance is correct", async () => {
      const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

      const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
      await sendAndConfirmTransaction(
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
              isBlacklister: false,
              isSeizer: false,
            }
          )
        ),
        [authority]
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
            mintAmount
          )
        ),
        [minterKeypair]
      );

      const balanceBeforeBurn = await connection.getTokenAccountBalance(burnerATA);
      expect(balanceBeforeBurn.value.amount).to.equal(String(mintAmount));

      const burnAmount = BigInt(50_000);
      await sendAndConfirmTransaction(
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
        [burnerKeypair]
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
      await sendAndConfirmTransaction(connection, new Transaction().add(pauseIx), [authority]);
      console.log("  Stablecoin paused");

      const unpauseIx = buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole);
      await sendAndConfirmTransaction(connection, new Transaction().add(unpauseIx), [authority]);
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
      await sendAndConfirmTransaction(connection, new Transaction().add(freezeIx), [authority]);
      console.log("  Account frozen");

      const thawIx = buildThawAccountIx(
        authority.publicKey,
        stablecoinPDA,
        authorityRole,
        mintKeypair.publicKey,
        recipientATA
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);
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
      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority]);
      console.log("  Authority transferred to new key");

      const ix2 = buildTransferAuthorityIx(
        newAuthority.publicKey,
        stablecoinPDA,
        authority.publicKey
      );
      await sendAndConfirmTransaction(connection, new Transaction().add(ix2), [newAuthority]);
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
  });
});
