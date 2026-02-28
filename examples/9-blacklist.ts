// Example 9: Blacklist add/remove.

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.generate();
  const blacklister = Keypair.generate();
  const minter = Keypair.generate();

  for (const kp of [authority, blacklister, minter]) {
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    } catch { }
  }

  const stable = await SolanaStablecoin.create(
    connection,
    { preset: "SSS_2", name: "Blacklist Demo", symbol: "BLK", uri: "https://example.com/blk.json", decimals: 6 },
    authority
  );

  await stable.updateRoles(authority.publicKey, {
    holder: blacklister.publicKey,
    roles: { isMinter: false, isBurner: false, isPauser: false, isBlacklister: true, isSeizer: false },
  });
  await stable.updateRoles(authority.publicKey, {
    holder: minter.publicKey,
    roles: { isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false },
  });
  await stable.updateMinter(authority.publicKey, { minter: minter.publicKey, quota: BigInt(100_000_000) });

  const badActor = Keypair.generate().publicKey;
  await stable.compliance.blacklistAdd(blacklister.publicKey, badActor, "OFAC match");
  console.log("Added to blacklist:", badActor.toBase58().slice(0, 8) + "...");

  await stable.compliance.blacklistRemove(blacklister.publicKey, badActor);
  console.log("Removed from blacklist");
}

main().catch(console.error);
