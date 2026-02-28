// Example 2: SSS-2 create, roles, blacklist.

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.generate();

  try {
    const sig = await connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  } catch {
    console.log("Airdrop skipped");
  }

  const stable = await SolanaStablecoin.create(
    connection,
    {
      preset: "SSS_2",
      name: "Regulated USD",
      symbol: "rUSD",
      uri: "https://example.com/regulated.json",
      decimals: 6,
    },
    authority
  );

  console.log("SSS-2 stablecoin created:");
  console.log("  Mint:", stable.mintAddress.toBase58());
  console.log("  isSSS2:", stable.isSSS2());

  const blacklister = Keypair.generate();
  const seizer = Keypair.generate();
  const minter = Keypair.generate();
  for (const kp of [blacklister, seizer, minter]) {
    try {
      const s = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(s);
    } catch { }
  }

  await stable.updateRoles(authority.publicKey, {
    holder: blacklister.publicKey,
    roles: {
      isMinter: false,
      isBurner: false,
      isPauser: false,
      isFreezer: false,
      isBlacklister: true,
      isSeizer: false,
    },
  });
  await stable.updateRoles(authority.publicKey, {
    holder: seizer.publicKey,
    roles: {
      isMinter: false,
      isBurner: false,
      isPauser: false,
      isFreezer: false,
      isBlacklister: false,
      isSeizer: true,
    },
  });
  await stable.updateRoles(authority.publicKey, {
    holder: minter.publicKey,
    roles: {
      isMinter: true,
      isBurner: false,
      isPauser: false,
      isFreezer: false,
      isBlacklister: false,
      isSeizer: false,
    },
  });
  await stable.updateMinter(authority.publicKey, {
    minter: minter.publicKey,
    quota: BigInt(1_000_000_000_000),
  });

  console.log("Blacklister:", blacklister.publicKey.toBase58());
  console.log("Seizer:", seizer.publicKey.toBase58());
  console.log("Minter:", minter.publicKey.toBase58());

  const badActor = Keypair.generate().publicKey;
  const txBl = await stable.compliance.blacklistAdd(
    blacklister.publicKey,
    badActor,
    "OFAC match"
  );
  console.log("Blacklist add tx:", txBl);

  console.log("SSS-2 compliance ready. Use compliance.seize(seizer, sourceAta, destAta) for seizure.");
}

main().catch(console.error);
