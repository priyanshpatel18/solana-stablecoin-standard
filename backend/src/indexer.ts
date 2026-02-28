import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "./logger";

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
  logger.error({ err: lastErr?.message ?? lastErr }, "Webhook POST failed after %s attempts", WEBHOOK_MAX_RETRIES);
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
    logger.info({ payload }, "program_logs");
    postWebhookWithRetry(payload).catch(() => {});
  },
  "confirmed"
);

logger.info({ programId: PROGRAM_ID.toBase58() }, "Indexer subscribed to program");
if (WEBHOOK_URL) {
  logger.info({ webhookUrl: WEBHOOK_URL, maxRetries: WEBHOOK_MAX_RETRIES, timeoutMs: WEBHOOK_TIMEOUT_MS }, "Webhook configured");
}
