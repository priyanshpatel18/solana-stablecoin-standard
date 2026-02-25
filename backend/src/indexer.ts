import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.SSS_TOKEN_PROGRAM_ID || "47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ"
);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_MAX_RETRIES = parseInt(process.env.WEBHOOK_MAX_RETRIES || "5", 10);
const WEBHOOK_TIMEOUT_MS = parseInt(process.env.WEBHOOK_TIMEOUT_MS || "10000", 10);

const connection = new Connection(RPC_URL);

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhookWithRetry(payload: object): Promise<void> {
  if (!WEBHOOK_URL) return;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < WEBHOOK_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return;
      lastErr = new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < WEBHOOK_MAX_RETRIES - 1) {
      const backoffMs = Math.min(1000 * 2 ** attempt, 30000);
      await sleep(backoffMs);
    }
  }
  console.error("Webhook POST failed after", WEBHOOK_MAX_RETRIES, "attempts:", lastErr?.message ?? lastErr);
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
    postWebhookWithRetry(payload).catch(() => {});
  },
  "confirmed"
);

console.log("Indexer subscribed to program", PROGRAM_ID.toBase58());
if (WEBHOOK_URL) {
  console.log("Webhook URL:", WEBHOOK_URL, "maxRetries:", WEBHOOK_MAX_RETRIES, "timeoutMs:", WEBHOOK_TIMEOUT_MS);
}
