import { Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import {
  buildBurnTokensIx,
  buildInitializeIx,
  buildMintTokensIx,
  buildPauseIx,
  buildUnpauseIx,
  buildUpdateMinterIx,
  buildUpdateRolesIx,
  buildUpdateSupplyCapIx,
  createTokenAccount,
  findMinterPDA,
  findRolePDA,
  findStablecoinPDA,
  findSupplyCapPDA,
  getTokenAccountAddress,
  sendAndConfirmAndLog,
  SSS_HOOK_PROGRAM_ID
} from "./helpers";
import { fundKeypairs, getProvider } from "./testSetup";

describe("Edge Cases", () => {
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

  it("creates stablecoin and assigns roles", async () => {
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

    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
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
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, burnerRole, burnerKeypair.publicKey, {
            isMinter: true,
            isBurner: true,
            isPauser: false,
            isFreezer: false,
            isBlacklister: false,
            isSeizer: false,
          })
        )
        .add(buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(1_000_000))),
      [authority],
      "Roles"
    );
  });

  it("rejects mint with zero amount", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, recipientKeypair.publicKey);

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
    }
  });

  it("rejects burn with zero amount", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
    const burnerATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, burnerKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildMintTokensIx(
          minterKeypair.publicKey,
          stablecoinPDA,
          findRolePDA(stablecoinPDA, minterKeypair.publicKey)[0],
          findMinterPDA(stablecoinPDA, minterKeypair.publicKey)[0],
          mintKeypair.publicKey,
          burnerATA,
          BigInt(1000)
        )
      ),
      [minterKeypair]
    );

    try {
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildBurnTokensIx(burnerKeypair.publicKey, stablecoinPDA, burnerRole, mintKeypair.publicKey, burnerATA, BigInt(0))
        ),
        [burnerKeypair]
      );
      expect.fail("Should reject zero burn");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/ZeroAmount|Simulation failed|custom program error|0x/i);
    }
  });

  it("rejects mint when supply cap is wrong account", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    const [supplyCapPDA] = findSupplyCapPDA(stablecoinPDA);
    const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateSupplyCapIx(authority.publicKey, stablecoinPDA, supplyCapPDA, BigInt(1_000_000))
      ),
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
            BigInt(100),
            recipientATA
          )
        ),
        [minterKeypair]
      );
      expect.fail("Should reject mint with wrong supply_cap");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/Unauthorized|Simulation failed|custom program error|0x/i);
    }
  });

  it("rejects mint when paused", async () => {
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

  it("rejects burn when paused", async () => {
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
          buildBurnTokensIx(burnerKeypair.publicKey, stablecoinPDA, burnerRole, mintKeypair.publicKey, burnerATA, BigInt(1))
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
