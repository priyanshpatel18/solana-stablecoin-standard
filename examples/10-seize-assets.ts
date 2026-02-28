// Example 10: Seize assets (source to treasury).

import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolanaStablecoin, TOKEN_2022_PROGRAM_ID } from "@stbr/sss-token";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.generate();
  const seizer = Keypair.generate();
  const minter = Keypair.generate();
  const pauser = Keypair.generate();
  const sourceOwner = Keypair.generate();

  for (const kp of [authority, seizer, minter, pauser, sourceOwner]) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    } catch { }
  }

  const stable = await SolanaStablecoin.create(
    connection,
    { preset: "SSS_2", name: "Seizure Demo", symbol: "SEIZE", uri: "https://example.com/sz.json", decimals: 6 },
    authority
  );

  await stable.updateRoles(authority.publicKey, {
    holder: seizer.publicKey,
    roles: { isMinter: false, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: true },
  });
  await stable.updateRoles(authority.publicKey, {
    holder: minter.publicKey,
    roles: { isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false },
  });
  await stable.updateRoles(authority.publicKey, {
    holder: pauser.publicKey,
    roles: { isMinter: false, isBurner: false, isPauser: true, isBlacklister: false, isSeizer: false },
  });
  await stable.updateMinter(authority.publicKey, { minter: minter.publicKey, quota: BigInt(100_000_000) });

  const sourceAta = getAssociatedTokenAddressSync(
    stable.mintAddress,
    sourceOwner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        sourceAta,
        sourceOwner.publicKey,
        stable.mintAddress,
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [authority]
  );
  await stable.thawAccount(pauser.publicKey, sourceAta);

  await stable.mint(minter.publicKey, {
    recipient: sourceOwner.publicKey,
    amount: BigInt(50_000_000),
    minter: minter.publicKey,
  });
  console.log("Minted 50 to source account");

  const treasuryAta = getAssociatedTokenAddressSync(
    stable.mintAddress,
    authority.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        treasuryAta,
        authority.publicKey,
        stable.mintAddress,
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [authority]
  );
  await stable.thawAccount(pauser.publicKey, treasuryAta);

  await stable.compliance.seize(seizer.publicKey, sourceAta, treasuryAta);
  console.log("Seized to treasury");

  const sourceAcc = await getAccount(connection, sourceAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  const treasuryAcc = await getAccount(connection, treasuryAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("Source balance:", sourceAcc.amount.toString());
  console.log("Treasury balance:", treasuryAcc.amount.toString());
}

main().catch(console.error);
