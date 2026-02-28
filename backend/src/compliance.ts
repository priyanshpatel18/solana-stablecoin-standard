/** Compliance: audit store, webhook, blacklist API, screening, audit export. */

import { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import {
  webhookBodySchema,
  blacklistGetQuerySchema,
  blacklistPostBodySchema,
  blacklistDeleteParamsSchema,
  screeningBodySchema,
  auditLogQuerySchema,
} from "./schemas";

export type AuditAction =
  | "program_logs"
  | "blacklist_add"
  | "blacklist_remove"
  | "seize"
  | "mint"
  | "burn"
  | "freeze"
  | "thaw"
  | "pause"
  | "unpause"
  | "roles"
  | "blocked";

export interface AuditEntry {
  timestamp: string;
  type: AuditAction;
  signature?: string;
  programId?: string;
  mint?: string;
  address?: string;
  targetAddress?: string;
  amount?: string;
  reason?: string;
  actor?: string;
  logs?: string[];
  err?: unknown;
}

const auditStore: AuditEntry[] = [];
const blacklistByMint = new Map<string, Array<{ address: string; reason?: string; addedAt: string }>>();

export function addAuditEntry(entry: Omit<AuditEntry, "timestamp">): void {
  auditStore.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
}

export function getAuditLog(filters: {
  action?: AuditAction;
  from?: string;
  to?: string;
  mint?: string;
}): AuditEntry[] {
  let list = [...auditStore];
  if (filters.action) list = list.filter((e) => e.type === filters.action);
  if (filters.mint) list = list.filter((e) => e.mint === filters.mint);
  if (filters.from) list = list.filter((e) => e.timestamp >= filters.from!);
  if (filters.to) list = list.filter((e) => e.timestamp <= filters.to!);
  return list.reverse();
}

export function getBlacklist(mint: string): Array<{ address: string; reason?: string; addedAt: string }> {
  return blacklistByMint.get(mint) ?? [];
}

export function addToBlacklistStore(mint: string, address: string, reason?: string): void {
  let list = blacklistByMint.get(mint);
  if (!list) {
    list = [];
    blacklistByMint.set(mint, list);
  }
  if (!list.some((e) => e.address === address)) {
    list.push({ address, reason, addedAt: new Date().toISOString() });
  }
}

export function removeFromBlacklistStore(mint: string, address: string): void {
  const list = blacklistByMint.get(mint);
  if (list) {
    const i = list.findIndex((e) => e.address === address);
    if (i >= 0) list.splice(i, 1);
  }
}

export async function isAddressBlocked(mint: string, address: string): Promise<boolean> {
  const list = getBlacklist(mint);
  if (list.some((e) => e.address === address)) return true;
  const screeningUrl = process.env.COMPLIANCE_SCREENING_URL;
  if (!screeningUrl) return false;
  try {
    const res = await fetch(screeningUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = res.ok ? await res.json() : { match: false };
    return Boolean(data?.match);
  } catch {
    return false;
  }
}

export function registerComplianceRoutes(
  app: import("express").IRouter,
  deps: {
    getKeypair: () => { publicKey: PublicKey };
    getConnection: () => import("@solana/web3.js").Connection;
    getMintAddress: () => string | undefined;
  }
): void {
  app.post("/compliance/webhook", (req: Request, res: Response) => {
    const parsed = webhookBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    if (body.type === "program_logs") {
      addAuditEntry({
        type: "program_logs",
        programId: body.programId,
        signature: body.signature,
        logs: body.logs,
        err: body.err,
      });
    }
    res.status(204).send();
  });

  app.get("/compliance/blacklist", (req: Request, res: Response) => {
    const parsed = blacklistGetQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const mint = parsed.data.mint || deps.getMintAddress();
    if (!mint) {
      return res.status(400).json({ error: "mint required (query or MINT_ADDRESS)" });
    }
    res.json({ mint, entries: getBlacklist(mint) });
  });

  app.post("/compliance/blacklist", async (req: Request, res: Response) => {
    const parsed = blacklistPostBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const mintAddr = parsed.data.mint || deps.getMintAddress();
    const address = parsed.data.address;
    const reason = parsed.data.reason ?? "";
    if (!mintAddr) {
      return res.status(400).json({ error: "mint required (body or MINT_ADDRESS)" });
    }
    try {
      const { getProgram } = await import("@stbr/sss-token");
      const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
      const kp = deps.getKeypair();
      const provider = new AnchorProvider(deps.getConnection(), new Wallet(kp as never), {});
      const program = getProgram(provider);
      const stable = await (await import("@stbr/sss-token")).SolanaStablecoin.load(
        program as never,
        new PublicKey(mintAddr)
      );
      const sig = await stable.compliance.blacklistAdd(
        kp.publicKey,
        new PublicKey(address),
        reason
      );
      addToBlacklistStore(mintAddr, address, reason);
      addAuditEntry({
        type: "blacklist_add",
        signature: sig,
        mint: mintAddr,
        address,
        reason,
        actor: kp.publicKey.toBase58(),
      });
      res.json({ success: true, signature: sig });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/compliance/blacklist/:address", async (req: Request, res: Response) => {
    const paramsParsed = blacklistDeleteParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ error: "Validation failed", details: paramsParsed.error.flatten() });
    }
    const address = paramsParsed.data.address;
    const queryParsed = blacklistGetQuerySchema.safeParse(req.query);
    const mintFromQuery = queryParsed.success ? queryParsed.data.mint : undefined;
    const mintFromBody = (req.body as { mint?: string })?.mint;
    const mintAddr = mintFromQuery || mintFromBody || deps.getMintAddress();
    if (!mintAddr) {
      return res.status(400).json({ error: "mint required (query, body, or MINT_ADDRESS)" });
    }
    try {
      const { getProgram } = await import("@stbr/sss-token");
      const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
      const kp = deps.getKeypair();
      const provider = new AnchorProvider(deps.getConnection(), new Wallet(kp as never), {});
      const program = getProgram(provider);
      const stable = await (await import("@stbr/sss-token")).SolanaStablecoin.load(
        program as never,
        new PublicKey(mintAddr)
      );
      const sig = await stable.compliance.blacklistRemove(kp.publicKey, new PublicKey(address));
      removeFromBlacklistStore(mintAddr, address);
      addAuditEntry({
        type: "blacklist_remove",
        signature: sig,
        mint: mintAddr,
        address,
        actor: kp.publicKey.toBase58(),
      });
      res.json({ success: true, signature: sig });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/compliance/screening", (req: Request, res: Response) => {
    const parsed = screeningBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const address = parsed.data.address;
    const screeningUrl = process.env.COMPLIANCE_SCREENING_URL;
    if (screeningUrl) {
      fetch(screeningUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
        .then((r) => (r.ok ? r.json() : { screened: true, match: false }))
        .then((data) => res.json(data))
        .catch(() => res.json({ screened: true, match: false }));
    } else {
      res.json({ screened: true, match: false });
    }
  });

  app.get("/compliance/audit-log", (req: Request, res: Response) => {
    const parsed = auditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const { action, from, to, mint, format } = parsed.data;
    const entries = getAuditLog({ action: (action as AuditAction) || undefined, from, to, mint });
    const outFormat = format ?? "json";
    if (outFormat === "csv") {
      const header = "timestamp,type,signature,mint,address,reason,actor,amount";
      const rows = entries.map(
        (e) =>
          [e.timestamp, e.type, e.signature ?? "", e.mint ?? "", e.address ?? "", e.reason ?? "", e.actor ?? "", e.amount ?? ""].join(
            ","
          )
      );
      res.setHeader("Content-Type", "text/csv");
      res.send([header, ...rows].join("\n"));
    } else {
      res.json({ entries });
    }
  });
}
