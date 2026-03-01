import { Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import {
  buildAddToBlacklistIx,
  buildBurnTokensIx,
  buildInitializeIx,
  buildMintTokensIx,
  buildUpdateMinterIx,
  buildUpdateRolesIx,
  createTokenAccount,
  findBlacklistPDA,
  findMinterPDA,
  findRolePDA,
  findStablecoinPDA,
  getTokenAccountAddress,
  sendAndConfirmAndLog,
  SSS_HOOK_PROGRAM_ID
} from "./helpers";
import { fundKeypairs, getProvider } from "./testSetup";

describe("Roles and Minters", () => {
  const provider = getProvider();
  const connection = provider.connection;
  const authority = provider.wallet.payer as Keypair;

  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let burnerKeypair: Keypair;
  let recipientKeypair: Keypair;
  let nonMinterKeypair: Keypair;
  let quotaTestMinter: Keypair;

  before(async () => {
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    burnerKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    nonMinterKeypair = Keypair.generate();
    quotaTestMinter = Keypair.generate();
    await fundKeypairs(provider, [minterKeypair, burnerKeypair, recipientKeypair, nonMinterKeypair, quotaTestMinter]);
  });

  it("creates stablecoin and assigns minter/burner roles", async () => {
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

  it("rejects mint from non-minter", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [nonMinterRole] = findRolePDA(stablecoinPDA, nonMinterKeypair.publicKey);
    const [nonMinterInfo] = findMinterPDA(stablecoinPDA, nonMinterKeypair.publicKey);

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, nonMinterRole, nonMinterKeypair.publicKey, {
          isMinter: false,
          isBurner: false,
          isPauser: false,
          isFreezer: false,
          isBlacklister: false,
          isSeizer: false,
        })
      ),
      [authority]
    );

    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, recipientKeypair.publicKey);

    try {
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildMintTokensIx(
            nonMinterKeypair.publicKey,
            stablecoinPDA,
            nonMinterRole,
            nonMinterInfo,
            mintKeypair.publicKey,
            recipientATA,
            BigInt(1)
          )
        ),
        [nonMinterKeypair]
      );
      expect.fail("Should reject mint from non-minter");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/Unauthorized|invalid|missing|required|Simulation failed|custom program error|0x/i);
    }
  });

  it("rejects burn from non-burner", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [nonBurnerRole] = findRolePDA(stablecoinPDA, nonMinterKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, nonBurnerRole, nonMinterKeypair.publicKey, {
          isMinter: false,
          isBurner: false,
          isPauser: false,
          isFreezer: false,
          isBlacklister: false,
          isSeizer: false,
        })
      ),
      [authority]
    );

    const nonBurnerATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, nonMinterKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildMintTokensIx(
          minterKeypair.publicKey,
          stablecoinPDA,
          findRolePDA(stablecoinPDA, minterKeypair.publicKey)[0],
          findMinterPDA(stablecoinPDA, minterKeypair.publicKey)[0],
          mintKeypair.publicKey,
          nonBurnerATA,
          BigInt(100)
        )
      ),
      [minterKeypair]
    );

    try {
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildBurnTokensIx(
            nonMinterKeypair.publicKey,
            stablecoinPDA,
            nonBurnerRole,
            mintKeypair.publicKey,
            nonBurnerATA,
            BigInt(1)
          )
        ),
        [nonMinterKeypair]
      );
      expect.fail("Should reject burn from non-burner");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/Unauthorized|invalid|missing|required|Simulation failed|custom program error|0x/i);
    }
  });

  it("rejects mint exceeding quota", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [quotaTestMinterRole] = findRolePDA(stablecoinPDA, quotaTestMinter.publicKey);
    const [quotaTestMinterInfo] = findMinterPDA(stablecoinPDA, quotaTestMinter.publicKey);
    const recipientATA = getTokenAccountAddress(mintKeypair.publicKey, recipientKeypair.publicKey);

    await sendAndConfirmTransaction(
      connection,
      new Transaction()
        .add(
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, quotaTestMinterRole, quotaTestMinter.publicKey, {
            isMinter: true,
            isBurner: false,
            isPauser: false,
            isFreezer: false,
            isBlacklister: false,
            isSeizer: false,
          })
        )
        .add(
          buildUpdateMinterIx(authority.publicKey, stablecoinPDA, quotaTestMinterInfo, quotaTestMinter.publicKey, BigInt(100))
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

  it("rejects add_to_blacklist from non-blacklister", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, authority.publicKey);
    try {
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          buildAddToBlacklistIx(minterKeypair.publicKey, stablecoinPDA, minterRole, blacklistEntry, authority.publicKey, "Should fail")
        ),
        [minterKeypair]
      );
      expect.fail("Should reject add_to_blacklist from non-blacklister");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).to.match(/Unauthorized|Simulation failed|custom program error|0x/i);
    }
  });
});
