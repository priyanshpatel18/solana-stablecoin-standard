// Example 7: Mint and burn (quota, minter, burner).

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
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const recipient = Keypair.generate();

  for (const kp of [authority, minter, burner, recipient]) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    } catch { }
  }

  const stable = await SolanaStablecoin.create(
    connection,
    { preset: "SSS_1", name: "Mint Burn", symbol: "MB", uri: "https://example.com/mb.json", decimals: 6 },
    authority
  );

  await stable.updateRoles(authority.publicKey, {
    holder: minter.publicKey,
    roles: { isMinter: true, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
  });
  await stable.updateRoles(authority.publicKey, {
    holder: burner.publicKey,
    roles: { isMinter: false, isBurner: true, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
  });
  await stable.updateMinter(authority.publicKey, { minter: minter.publicKey, quota: BigInt(50_000_000) });

  const recipientAta = getAssociatedTokenAddressSync(
    stable.mintAddress,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        recipientAta,
        recipient.publicKey,
        stable.mintAddress,
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [authority]
  );

  await stable.mint(minter.publicKey, {
    recipient: recipient.publicKey,
    amount: BigInt(20_000_000),
    minter: minter.publicKey,
  });
  console.log("Minted 20 to recipient");

  await stable.updateRoles(authority.publicKey, {
    holder: recipient.publicKey,
    roles: { isMinter: false, isBurner: true, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
  });
  await stable.burn(recipient.publicKey, { amount: BigInt(5_000_000) });
  console.log("Burned 5 from recipient");

  const supply = await stable.getTotalSupply();
  console.log("Supply:", supply.toString());
}

main().catch(console.error);
