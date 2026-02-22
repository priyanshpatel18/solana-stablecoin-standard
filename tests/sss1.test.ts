import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  buildInitializeIx,
  findRolePDA,
  findStablecoinPDA,
  SSS_HOOK_PROGRAM_ID,
  SSS_TOKEN_PROGRAM_ID
} from "./helpers";


describe("SSS-1: Minimal Stablecoin Lifecycle", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");

  let authority: Keypair;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let burnerKeypair: Keypair;
  let recipientKeypair: Keypair;
  let newAuthority: Keypair;

  before(async () => {
    authority = Keypair.generate();
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    burnerKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    newAuthority = Keypair.generate();

    // Airdrop SOL to all signers
    for (const kp of [authority, minterKeypair, burnerKeypair, recipientKeypair, newAuthority]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }
  });

  it("initializes an SSS-1 stablecoin", async () => {
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

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority, mintKeypair]);
    expect(sig).to.be.a("string");

    // Verify account exists
    const info = await connection.getAccountInfo(stablecoinPDA);
    expect(info).to.not.be.null;
    expect(info!.owner.equals(SSS_TOKEN_PROGRAM_ID)).to.be.true;
  });

});
