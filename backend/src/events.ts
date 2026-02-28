/** Parse Anchor events from program logs, add audit entries, and POST to webhook. */

import type { Idl } from "@coral-xyz/anchor";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { addAuditEntry } from "./compliance";
import type { AuditAction } from "./compliance";
import { logger } from "./logger";

const PROGRAM_ID = new PublicKey(
  process.env.SSS_TOKEN_PROGRAM_ID || "47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ"
);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_MAX_RETRIES = parseInt(process.env.WEBHOOK_MAX_RETRIES || "5", 10);
const WEBHOOK_TIMEOUT_MS = parseInt(process.env.WEBHOOK_TIMEOUT_MS || "10000", 10);

const idlPaths: string[] = [
  path.join(__dirname, "../../sdk/core/src/idl/solana_stablecoin_standard.json"),
  path.join(process.cwd(), "sdk/core/src/idl/solana_stablecoin_standard.json"),
];
try {
  idlPaths.push(
    path.join(path.dirname(require.resolve("@stbr/sss-token/package.json")), "src/idl/solana_stablecoin_standard.json")
  );
} catch {
  // @stbr/sss-token not resolvable
}
let idl: Idl | null = null;
for (const idlPath of idlPaths) {
  try {
    idl = JSON.parse(fs.readFileSync(idlPath, "utf-8")) as Idl;
    break;
  } catch {
    continue;
  }
}
if (!idl) {
  throw new Error("Could not load IDL from any path: " + idlPaths.join(", "));
}

const coder = new BorshCoder(idl);
const eventParser = new EventParser(PROGRAM_ID, coder);

function toBase58(pk: { toBase58?: () => string } | string): string {
  if (typeof pk === "string") return pk;
  return (pk as { toBase58: () => string }).toBase58();
}

function mapEventToAudit(
  name: string,
  data: Record<string, unknown>,
  signature: string
): { type: AuditAction; entry: Parameters<typeof addAuditEntry>[0] } | null {
  const base = { signature, programId: PROGRAM_ID.toBase58() };
  switch (name) {
    case "TokensMinted":
      return {
        type: "mint",
        entry: {
          ...base,
          type: "mint",
          mint: undefined,
          address: toBase58(data.recipient as PublicKey),
          amount: String((data.amount as bigint) ?? (data.amount as number)),
          actor: toBase58(data.minter as PublicKey),
        },
      };
    case "TokensBurned":
      return {
        type: "burn",
        entry: {
          ...base,
          type: "burn",
          mint: undefined,
          address: toBase58(data.burner as PublicKey),
          amount: String((data.amount as bigint) ?? (data.amount as number)),
          actor: toBase58(data.burner as PublicKey),
        },
      };
    case "AccountFrozen":
      return {
        type: "freeze",
        entry: {
          ...base,
          type: "freeze",
          mint: undefined,
          address: toBase58(data.account as PublicKey),
          actor: toBase58(data.frozen_by as PublicKey),
        },
      };
    case "AccountThawed":
      return {
        type: "thaw",
        entry: {
          ...base,
          type: "thaw",
          mint: undefined,
          address: toBase58(data.account as PublicKey),
          actor: toBase58(data.thawed_by as PublicKey),
        },
      };
    case "StablecoinPaused":
      return {
        type: "pause",
        entry: {
          ...base,
          type: "pause",
          mint: undefined,
          actor: toBase58(data.paused_by as PublicKey),
        },
      };
    case "StablecoinUnpaused":
      return {
        type: "unpause",
        entry: {
          ...base,
          type: "unpause",
          mint: undefined,
          actor: toBase58(data.unpaused_by as PublicKey),
        },
      };
    case "AddedToBlacklist":
      return {
        type: "blacklist_add",
        entry: {
          ...base,
          type: "blacklist_add",
          mint: undefined,
          address: toBase58(data.address as PublicKey),
          reason: (data.reason as string) ?? "",
          actor: toBase58(data.blacklisted_by as PublicKey),
        },
      };
    case "RemovedFromBlacklist":
      return {
        type: "blacklist_remove",
        entry: {
          ...base,
          type: "blacklist_remove",
          mint: undefined,
          address: toBase58(data.address as PublicKey),
          actor: toBase58(data.removed_by as PublicKey),
        },
      };
    case "TokensSeized":
      return {
        type: "seize",
        entry: {
          ...base,
          type: "seize",
          mint: undefined,
          address: toBase58(data.from as PublicKey),
          targetAddress: toBase58(data.to as PublicKey),
          amount: String((data.amount as bigint) ?? (data.amount as number)),
          actor: toBase58(data.seized_by as PublicKey),
        },
      };
    case "RolesUpdated":
      return {
        type: "roles",
        entry: {
          ...base,
          type: "roles",
          mint: undefined,
          address: toBase58(data.holder as PublicKey),
          actor: toBase58(data.updated_by as PublicKey),
        },
      };
    case "AuthorityTransferred":
      return {
        type: "authority_transfer",
        entry: {
          ...base,
          type: "authority_transfer",
          mint: undefined,
          address: toBase58(data.new_authority as PublicKey),
          targetAddress: toBase58(data.previous_authority as PublicKey),
          actor: toBase58(data.previous_authority as PublicKey),
        },
      };
    case "MinterUpdated":
      return {
        type: "minter_update",
        entry: {
          ...base,
          type: "minter_update",
          mint: undefined,
          address: toBase58(data.minter as PublicKey),
          amount: String((data.new_quota as bigint) ?? (data.new_quota as number)),
          actor: toBase58(data.updated_by as PublicKey),
        },
      };
    case "StablecoinInitialized":
      return {
        type: "init",
        entry: {
          ...base,
          type: "init",
          mint: toBase58(data.mint as PublicKey),
          address: toBase58(data.authority as PublicKey),
        },
      };
    default:
      return null;
  }
}

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
  logger.error(
    { err: lastErr?.message ?? lastErr },
    "Webhook POST failed after %s attempts",
    WEBHOOK_MAX_RETRIES
  );
}

export function processLogs(signature: string, logs: string[], err: unknown): void {
  if (err) return;
  for (const event of eventParser.parseLogs(logs)) {
    const mapped = mapEventToAudit(event.name, event.data as Record<string, unknown>, signature);
    if (mapped) {
      addAuditEntry(mapped.entry);
      const payload = {
        type: mapped.type,
        signature,
        programId: PROGRAM_ID.toBase58(),
        eventName: event.name,
        data: event.data,
      };
      postWebhookWithRetry(payload).catch(() => {});
    }
  }
}

export function subscribeToProgramLogs(connection: Connection): void {
  const runListener = process.env.RUN_EVENT_LISTENER !== "false" && process.env.AUDIT_FROM_CHAIN !== "false";
  if (!runListener) {
    logger.info("Event listener disabled (RUN_EVENT_LISTENER or AUDIT_FROM_CHAIN=false)");
    return;
  }
  connection.onLogs(
    PROGRAM_ID,
    (logs) => {
      processLogs(logs.signature, logs.logs, logs.err);
    },
    "confirmed"
  );
  logger.info({ programId: PROGRAM_ID.toBase58() }, "Event listener subscribed to program");
  if (WEBHOOK_URL) {
    logger.info(
      { webhookUrl: WEBHOOK_URL, maxRetries: WEBHOOK_MAX_RETRIES, timeoutMs: WEBHOOK_TIMEOUT_MS },
      "Webhook configured"
    );
  }
}
