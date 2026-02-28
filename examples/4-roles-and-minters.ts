// Example 4: Load by mint, update roles and minter quota.

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, getProgram } from "@stbr/sss-token";
import * as fs from "fs";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";
const keypairPath = process.env.KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;

function loadKeypair(path: string): Keypair {
  const data = JSON.parse(fs.readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

async function main() {
  const mintArg = process.argv[2];
  if (!mintArg) {
    console.error("Usage: npx tsx examples/4-roles-and-minters.ts <MINT_ADDRESS>");
    process.exit(1);
  }

  const connection = new Connection(RPC, "confirmed");
  const authority = loadKeypair(keypairPath);

  try {
    const sig = await connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  } catch {
    console.log("Airdrop skipped");
  }

  const mint = new PublicKey(mintArg);
  const provider = new AnchorProvider(connection, new Wallet(authority), {});
  const program = getProgram(provider);
  const stable = await SolanaStablecoin.load(program, mint);

  console.log("Loaded stablecoin:", stable.mintAddress.toBase58());

  const newMinter = Keypair.generate();
  try {
    const a = await connection.requestAirdrop(newMinter.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(a);
  } catch { }

  await stable.updateRoles(authority.publicKey, {
    holder: newMinter.publicKey,
    roles: {
      isMinter: true,
      isBurner: false,
      isPauser: false,
      isBlacklister: false,
      isSeizer: false,
    },
  });
  await stable.updateMinter(authority.publicKey, {
    minter: newMinter.publicKey,
    quota: BigInt(500_000_000),
  });

  console.log("Granted minter role and quota to:", newMinter.publicKey.toBase58());
}

main().catch(console.error);
