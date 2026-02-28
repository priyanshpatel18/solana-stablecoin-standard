import "dotenv/config";
import express from "express";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import {
  registerComplianceRoutes,
  addAuditEntry,
  isAddressBlocked,
} from "./compliance";
import { logger } from "./logger";
import { requestIdMiddleware, requestLogMiddleware } from "./middleware/requestId";
import { apiKeyMiddleware } from "./middleware/auth";
import { operationsRateLimit } from "./middleware/rateLimit";
import {
  mintBodySchema,
  burnBodySchema,
  freezeThawBodySchema,
  pauseUnpauseBodySchema,
  seizeBodySchema,
} from "./schemas";
import { TOKEN_2022_PROGRAM_ID } from "@stbr/sss-token";

const app = express();
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || "", ".config/solana/id.json");
const MINT_ADDRESS = process.env.MINT_ADDRESS;
const PORT = parseInt(process.env.PORT || "3000", 10);

const connection = new Connection(RPC_URL);

app.use(express.json());
app.use(requestIdMiddleware);
app.use(requestLogMiddleware);

function getKeypair(): Keypair {
  const data = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

async function loadStable(mint: string) {
  const { getProgram, SolanaStablecoin } = await import("@stbr/sss-token");
  const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
  const kp = getKeypair();
  const provider = new AnchorProvider(connection, new Wallet(kp), {});
  const program = getProgram(provider);
  return SolanaStablecoin.load(program as never, new PublicKey(mint));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", rpc: RPC_URL, mint: MINT_ADDRESS || null, compliance: true });
});

app.get("/status/:mint", async (req, res) => {
  const { mint: mintParam } = req.params;
  if (!mintParam) {
    return res.status(400).json({ error: "mint required" });
  }
  try {
    const stable = await loadStable(mintParam);
    const state = await stable.getState();
    const supply = await stable.getTotalSupply();
    res.json({
      mint: state.mint.toBase58(),
      authority: state.authority.toBase58(),
      name: state.name,
      symbol: state.symbol,
      uri: state.uri,
      decimals: state.decimals,
      paused: state.paused,
      totalMinted: state.total_minted.toString(),
      totalBurned: state.total_burned.toString(),
      supply: supply.toString(),
      preset: state.enable_permanent_delegate && state.enable_transfer_hook ? "SSS-2" : "SSS-1",
      enablePermanentDelegate: state.enable_permanent_delegate,
      enableTransferHook: state.enable_transfer_hook,
      defaultAccountFrozen: state.default_account_frozen,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

const protectedRouter = express.Router();
protectedRouter.use(apiKeyMiddleware);
protectedRouter.use(operationsRateLimit);

protectedRouter.post("/mint-request", async (req, res) => {
  const parsed = mintBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const { recipient, amount, minter } = parsed.data;
  const mint = MINT_ADDRESS;
  if (!mint) {
    return res.status(500).json({ error: "MINT_ADDRESS not configured" });
  }
  const blockedRecipient = await isAddressBlocked(mint, recipient);
  if (blockedRecipient) {
    addAuditEntry({ type: "blocked", mint, address: recipient, reason: "screening" });
    return res.status(403).json({ error: "Blocked" });
  }
  const minterPubkey = minter || getKeypair().publicKey.toBase58();
  if (minter && minter !== getKeypair().publicKey.toBase58()) {
    const blockedMinter = await isAddressBlocked(mint, minterPubkey);
    if (blockedMinter) {
      addAuditEntry({ type: "blocked", mint, address: minterPubkey, reason: "screening" });
      return res.status(403).json({ error: "Blocked" });
    }
  }
  try {
    const kp = getKeypair();
    const stable = await loadStable(mint);
    const sig = await stable.mint(
      minter ? new PublicKey(minter) : kp.publicKey,
      {
        recipient: new PublicKey(recipient),
        amount: BigInt(amount),
        minter: minter ? new PublicKey(minter) : kp.publicKey,
      }
    );
    addAuditEntry({
      type: "mint",
      signature: sig,
      mint,
      address: recipient,
      amount: String(amount),
      actor: minter ? new PublicKey(minter).toBase58() : kp.publicKey.toBase58(),
    });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

protectedRouter.post("/burn-request", async (req, res) => {
  const parsed = burnBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const { amount, burner } = parsed.data;
  const mint = MINT_ADDRESS;
  if (!mint) {
    return res.status(500).json({ error: "MINT_ADDRESS not configured" });
  }
  const burnerPubkey = burner || getKeypair().publicKey.toBase58();
  const blocked = await isAddressBlocked(mint, burnerPubkey);
  if (blocked) {
    addAuditEntry({ type: "blocked", mint, address: burnerPubkey, reason: "screening" });
    return res.status(403).json({ error: "Blocked" });
  }
  try {
    const kp = getKeypair();
    const stable = await loadStable(mint);
    const signer = burner ? new PublicKey(burner) : kp.publicKey;
    const sig = await stable.burn(signer, { amount: BigInt(amount) });
    addAuditEntry({
      type: "burn",
      signature: sig,
      mint,
      address: signer.toBase58(),
      amount: String(amount),
      actor: signer.toBase58(),
    });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

protectedRouter.post("/operations/freeze", async (req, res) => {
  const parsed = freezeThawBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const { mint, account } = parsed.data;
  try {
    const kp = getKeypair();
    const stable = await loadStable(mint);
    const sig = await stable.freezeAccount(kp.publicKey, new PublicKey(account));
    addAuditEntry({ type: "freeze", signature: sig, mint, address: account, actor: kp.publicKey.toBase58() });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

protectedRouter.post("/operations/thaw", async (req, res) => {
  const parsed = freezeThawBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const { mint, account } = parsed.data;
  try {
    const kp = getKeypair();
    const stable = await loadStable(mint);
    const sig = await stable.thawAccount(kp.publicKey, new PublicKey(account));
    addAuditEntry({ type: "thaw", signature: sig, mint, address: account, actor: kp.publicKey.toBase58() });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

protectedRouter.post("/operations/pause", async (req, res) => {
  const parsed = pauseUnpauseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const { mint } = parsed.data;
  try {
    const kp = getKeypair();
    const stable = await loadStable(mint);
    const sig = await stable.pause(kp.publicKey);
    addAuditEntry({ type: "pause", signature: sig, mint, actor: kp.publicKey.toBase58() });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

protectedRouter.post("/operations/unpause", async (req, res) => {
  const parsed = pauseUnpauseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const { mint } = parsed.data;
  try {
    const kp = getKeypair();
    const stable = await loadStable(mint);
    const sig = await stable.unpause(kp.publicKey);
    addAuditEntry({ type: "unpause", signature: sig, mint, actor: kp.publicKey.toBase58() });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

protectedRouter.post("/operations/seize", async (req, res) => {
  const parsed = seizeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const { mint, from, to, amount } = parsed.data;
  try {
    const kp = getKeypair();
    const stable = await loadStable(mint);
    const mintPk = new PublicKey(mint);
    const sourceAta = getAssociatedTokenAddressSync(
      mintPk,
      new PublicKey(from),
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const destAta = getAssociatedTokenAddressSync(
      mintPk,
      new PublicKey(to),
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const sig = await stable.compliance.seize(kp.publicKey, sourceAta, destAta);
    addAuditEntry({
      type: "seize",
      signature: sig,
      mint,
      address: from,
      targetAddress: to,
      amount: String(amount),
      actor: kp.publicKey.toBase58(),
    });
    res.json({ success: true, signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

registerComplianceRoutes(protectedRouter, {
  getKeypair,
  getConnection: () => connection,
  getMintAddress: () => MINT_ADDRESS,
});

app.use("/", protectedRouter);

app.listen(PORT, () => {
  logger.info({ port: PORT, rpc: RPC_URL, mint: MINT_ADDRESS ?? null }, "SSS backend listening");
});
