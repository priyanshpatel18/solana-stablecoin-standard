import "dotenv/config";
import express from "express";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const app = express();
app.use(express.json());

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || "", ".config/solana/id.json");
const MINT_ADDRESS = process.env.MINT_ADDRESS;
const PORT = parseInt(process.env.PORT || "3000", 10);

const connection = new Connection(RPC_URL);

function getKeypair(): Keypair {
  const data = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", rpc: RPC_URL, mint: MINT_ADDRESS || null });
});

app.post("/mint-request", async (req, res) => {
  if (!MINT_ADDRESS) {
    return res.status(500).json({ error: "MINT_ADDRESS not configured" });
  }
  const { recipient, amount, minter } = req.body || {};
  if (!recipient || amount == null) {
    return res.status(400).json({ error: "recipient and amount required" });
  }
  try {
    const { getProgram } = await import("@stbr/sss-token");
    const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
    const kp = getKeypair();
    const provider = new AnchorProvider(connection, new Wallet(kp), {});
    const program = getProgram(provider);
    const stable = await (await import("@stbr/sss-token")).SolanaStablecoin.load(
      program as never,
      new PublicKey(MINT_ADDRESS)
    );
    const sig = await stable.mint(minter ? new PublicKey(minter) : kp.publicKey, {
      recipient: new PublicKey(recipient),
      amount: BigInt(amount),
      minter: minter ? new PublicKey(minter) : kp.publicKey,
    });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.post("/burn-request", async (req, res) => {
  if (!MINT_ADDRESS) {
    return res.status(500).json({ error: "MINT_ADDRESS not configured" });
  }
  const { amount, burner } = req.body || {};
  if (amount == null) {
    return res.status(400).json({ error: "amount required" });
  }
  try {
    const { getProgram } = await import("@stbr/sss-token");
    const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
    const kp = getKeypair();
    const provider = new AnchorProvider(connection, new Wallet(kp), {});
    const program = getProgram(provider);
    const stable = await (await import("@stbr/sss-token")).SolanaStablecoin.load(
      program as never,
      new PublicKey(MINT_ADDRESS)
    );
    const signer = burner ? new PublicKey(burner) : kp.publicKey;
    const sig = await stable.burn(signer, { amount: BigInt(amount) });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`SSS backend listening on port ${PORT}`);
  console.log(`  RPC: ${RPC_URL}`);
  console.log(`  Mint: ${MINT_ADDRESS || "(not set)"}`);
});
