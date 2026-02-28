// Example 3: Custom extensions (no preset).

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

const RPC = process.env.RPC_URL ?? "http://localhost:8899";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = Keypair.generate();

  try {
    const sig = await connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  } catch {
    console.log("Airdrop skipped");
  }

  const stable = await SolanaStablecoin.create(
    connection,
    {
      name: "Custom Stable",
      symbol: "CUSD",
      uri: "https://example.com/custom.json",
      decimals: 6,
      extensions: {
        enablePermanentDelegate: true,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      },
    },
    authority
  );

  console.log("Custom stablecoin created:");
  console.log("  Mint:", stable.mintAddress.toBase58());
  const state = await stable.getState();
  console.log("  Permanent delegate:", state.enable_permanent_delegate);
  console.log("  Transfer hook:", state.enable_transfer_hook);
  console.log("  Default frozen:", state.default_account_frozen);
  console.log("  isSSS2:", stable.isSSS2());
}

main().catch(console.error);
