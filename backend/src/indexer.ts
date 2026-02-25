import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.SSS_TOKEN_PROGRAM_ID || "BMWu6XvhKMXitwv3FCjjm2zZGD4pXeB1KX5oiUcPxGDB"
);
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const connection = new Connection(RPC_URL);

async function postWebhook(payload: object): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("Webhook POST failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("Webhook error:", e);
  }
}

connection.onLogs(
  PROGRAM_ID,
  (logs) => {
    const payload = {
      type: "program_logs",
      programId: PROGRAM_ID.toBase58(),
      signature: logs.signature,
      logs: logs.logs,
      err: logs.err,
    };
    console.log(JSON.stringify(payload));
    postWebhook(payload).catch(() => {});
  },
  "confirmed"
);

console.log("Indexer subscribed to program", PROGRAM_ID.toBase58());
if (WEBHOOK_URL) console.log("Webhook URL:", WEBHOOK_URL);
