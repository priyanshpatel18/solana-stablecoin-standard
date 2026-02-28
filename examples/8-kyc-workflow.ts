// Example 8: KYC workflow (default frozen, thaw, mint).

import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolanaStablecoin, TOKEN_2022_PROGRAM_ID } from "@stbr/sss-token";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.generate();
  const pauser = Keypair.generate();
  const minter = Keypair.generate();
  const alice = Keypair.generate();

  for (const kp of [authority, pauser, minter, alice]) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    } catch { }
  }

  const stable = await SolanaStablecoin.create(
    connection,
    { preset: "SSS_2", name: "KYC Dollar", symbol: "kUSD", uri: "https://example.com/k.json", decimals: 6 },
    authority
  );

  await stable.updateRoles(authority.publicKey, {
    holder: pauser.publicKey,
    roles: { isMinter: false, isBurner: false, isPauser: true, isFreezer: false, isBlacklister: false, isSeizer: false },
  });
  await stable.updateRoles(authority.publicKey, {
    holder: minter.publicKey,
    roles: { isMinter: true, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
  });
  await stable.updateMinter(authority.publicKey, { minter: minter.publicKey, quota: BigInt(100_000_000) });

  const aliceAta = getAssociatedTokenAddressSync(
    stable.mintAddress,
    alice.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        alice.publicKey,
        aliceAta,
        alice.publicKey,
        stable.mintAddress,
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [alice]
  );
  console.log("Alice ATA created (frozen by default in SSS-2)");

  try {
    await stable.mint(minter.publicKey, {
      recipient: alice.publicKey,
      amount: BigInt(10_000_000),
      minter: minter.publicKey,
    });
    console.log("ERROR: mint to frozen should fail");
  } catch {
    console.log("Mint to frozen account blocked");
  }

  await stable.thawAccount(pauser.publicKey, aliceAta);
  console.log("Pauser thawed Alice (KYC approved)");

  await stable.mint(minter.publicKey, {
    recipient: alice.publicKey,
    amount: BigInt(10_000_000),
    minter: minter.publicKey,
  });
  console.log("Minted 10 to Alice");

  await stable.freezeAccount(pauser.publicKey, aliceAta);
  console.log("KYC revoked — Alice re-frozen");
}

main().catch(console.error);
