// Example 5: Freeze and pause.

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
  const user = Keypair.generate();

  for (const kp of [authority, pauser, minter, user]) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    } catch { }
  }

  const stable = await SolanaStablecoin.create(
    connection,
    { preset: "SSS_1", name: "Safe USD", symbol: "sUSD", uri: "https://example.com/s.json", decimals: 6 },
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

  const userAta = getAssociatedTokenAddressSync(
    stable.mintAddress,
    user.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        userAta,
        user.publicKey,
        stable.mintAddress,
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [authority]
  );
  await stable.mint(minter.publicKey, {
    recipient: user.publicKey,
    amount: BigInt(50_000_000),
    minter: minter.publicKey,
  });
  console.log("Minted 50 to user");

  await stable.freezeAccount(pauser.publicKey, userAta);
  console.log("Froze user account");
  try {
    await stable.mint(minter.publicKey, {
      recipient: user.publicKey,
      amount: BigInt(1_000_000),
      minter: minter.publicKey,
    });
    console.log("ERROR: mint to frozen should fail");
  } catch {
    console.log("Mint to frozen account failed (expected)");
  }

  await stable.thawAccount(pauser.publicKey, userAta);
  console.log("Thawed user account");
  await stable.mint(minter.publicKey, {
    recipient: user.publicKey,
    amount: BigInt(1_000_000),
    minter: minter.publicKey,
  });
  console.log("Mint after thaw succeeded");

  await stable.pause(pauser.publicKey);
  console.log("Paused stablecoin");
  try {
    await stable.mint(minter.publicKey, {
      recipient: user.publicKey,
      amount: BigInt(1_000_000),
      minter: minter.publicKey,
    });
    console.log("ERROR: mint while paused should fail");
  } catch {
    console.log("Mint while paused failed (expected)");
  }

  await stable.unpause(pauser.publicKey);
  console.log("Unpaused stablecoin");
  await stable.mint(minter.publicKey, {
    recipient: user.publicKey,
    amount: BigInt(1_000_000),
    minter: minter.publicKey,
  });
  console.log("Mint after unpause succeeded");
}

main().catch(console.error);
