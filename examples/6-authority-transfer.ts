// Example 6: Authority transfer.

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const oldAuthority = Keypair.generate();
  const newAuthority = Keypair.generate();
  const minter = Keypair.generate();

  for (const kp of [oldAuthority, newAuthority, minter]) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    } catch { }
  }

  const stable = await SolanaStablecoin.create(
    connection,
    { preset: "SSS_1", name: "Transfer Demo", symbol: "XFER", uri: "https://example.com/x.json", decimals: 6 },
    oldAuthority
  );
  console.log("Stablecoin created, authority:", oldAuthority.publicKey.toBase58());

  await stable.updateRoles(oldAuthority.publicKey, {
    holder: minter.publicKey,
    roles: { isMinter: true, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
  });
  await stable.updateMinter(oldAuthority.publicKey, { minter: minter.publicKey, quota: BigInt(100_000_000) });
  console.log("Old authority assigned minter role");

  await stable.transferAuthority(oldAuthority.publicKey, newAuthority.publicKey);
  console.log("Authority transferred to:", newAuthority.publicKey.toBase58());

  try {
    await stable.updateRoles(oldAuthority.publicKey, {
      holder: minter.publicKey,
      roles: { isMinter: false, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
    });
    console.log("ERROR: old authority should be rejected");
  } catch {
    console.log("Old authority rejected (expected)");
  }

  await stable.updateRoles(newAuthority.publicKey, {
    holder: minter.publicKey,
    roles: { isMinter: true, isBurner: true, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
  });
  console.log("New authority updated roles");
}

main().catch(console.error);
