import { Keypair, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import {
  buildInitializeIx,
  buildPauseIx,
  buildTransferAuthorityIx,
  buildUnpauseIx,
  buildUpdateRolesIx,
  findRolePDA,
  findStablecoinPDA,
  sendAndConfirmAndLog,
  SSS_HOOK_PROGRAM_ID,
} from "./helpers";
import { fundKeypairs, getProvider } from "./testSetup";

describe("Authority Transfer", () => {
  const provider = getProvider();
  const connection = provider.connection;
  const authority = provider.wallet.payer as Keypair;

  let mintKeypair: Keypair;
  let newAuthorityKeypair: Keypair;

  before(async () => {
    mintKeypair = Keypair.generate();
    newAuthorityKeypair = Keypair.generate();
    await fundKeypairs(provider, [newAuthorityKeypair]);
  });

  it("creates stablecoin and assigns pauser to new authority", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [newAuthorityRole] = findRolePDA(stablecoinPDA, newAuthorityKeypair.publicKey);

    const ix = buildInitializeIx(
      authority.publicKey,
      stablecoinPDA,
      mintKeypair.publicKey,
      authorityRole,
      SSS_HOOK_PROGRAM_ID,
      { name: "Test USD", symbol: "TUSD", uri: "", decimals: 6, enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false }
    );
    await sendAndConfirmAndLog(connection, new Transaction().add(ix), [authority, mintKeypair], "Initialize");

    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, newAuthorityRole, newAuthorityKeypair.publicKey, {
          isMinter: false,
          isBurner: false,
          isPauser: true,
          isFreezer: false,
          isBlacklister: false,
          isSeizer: false,
        })
      ),
      [authority],
      "Pauser role for new authority"
    );
  });

  it("transfers authority to new key then back", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(buildTransferAuthorityIx(authority.publicKey, stablecoinPDA, newAuthorityKeypair.publicKey)),
      [authority],
      "Transfer authority"
    );

    await sendAndConfirmAndLog(
      connection,
      new Transaction().add(buildTransferAuthorityIx(newAuthorityKeypair.publicKey, stablecoinPDA, authority.publicKey)),
      [newAuthorityKeypair],
      "Transfer authority back"
    );
  });

  it("old authority cannot pause after transfer", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [newAuthorityRole] = findRolePDA(stablecoinPDA, newAuthorityKeypair.publicKey);

    await sendAndConfirmTransaction(
      connection,
      new Transaction()
        .add(
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, newAuthorityRole, newAuthorityKeypair.publicKey, {
            isMinter: false,
            isBurner: false,
            isPauser: true,
            isFreezer: false,
            isBlacklister: false,
            isSeizer: false,
          })
        )
        .add(
          buildUpdateRolesIx(authority.publicKey, stablecoinPDA, authorityRole, authority.publicKey, {
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

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(buildTransferAuthorityIx(authority.publicKey, stablecoinPDA, newAuthorityKeypair.publicKey)),
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
      new Transaction().add(buildTransferAuthorityIx(newAuthorityKeypair.publicKey, stablecoinPDA, authority.publicKey)),
      [newAuthorityKeypair]
    );
  });

  it("new authority can pause after transfer", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [newAuthorityRole] = findRolePDA(stablecoinPDA, newAuthorityKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, newAuthorityRole, newAuthorityKeypair.publicKey, {
          isMinter: false,
          isBurner: false,
          isPauser: true,
          isFreezer: false,
          isBlacklister: false,
          isSeizer: false,
        })
      ),
      [authority]
    );

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(buildTransferAuthorityIx(authority.publicKey, stablecoinPDA, newAuthorityKeypair.publicKey)),
      [authority]
    );

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(buildPauseIx(newAuthorityKeypair.publicKey, stablecoinPDA, newAuthorityRole)),
      [newAuthorityKeypair]
    );

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(buildUnpauseIx(newAuthorityKeypair.publicKey, stablecoinPDA, newAuthorityRole)),
      [newAuthorityKeypair]
    );

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(newAuthorityKeypair.publicKey, stablecoinPDA, authorityRole, authority.publicKey, {
          isMinter: false,
          isBurner: false,
          isPauser: true,
          isFreezer: false,
          isBlacklister: false,
          isSeizer: false,
        })
      ),
      [newAuthorityKeypair]
    );

    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(buildTransferAuthorityIx(newAuthorityKeypair.publicKey, stablecoinPDA, authority.publicKey)),
      [newAuthorityKeypair]
    );
  });
});
