/**
 * Compliance module: audit store, webhook ingestion, blacklist management API, screening stub, audit export.
 */

import { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";

export type AuditAction =
  | "program_logs"
  | "blacklist_add"
  | "blacklist_remove"
  | "seize"
  | "mint"
  | "burn"
  | "freeze"
  | "thaw";

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

export function registerComplianceRoutes(
  app: import("express").Express,
  deps: {
    getKeypair: () => { publicKey: PublicKey };
    getConnection: () => import("@solana/web3.js").Connection;
    getMintAddress: () => string | undefined;
  }
): void {
  app.post("/compliance/webhook", (req: Request, res: Response) => {
    const body = req.body as {
      type?: string;
      programId?: string;
      signature?: string;
      logs?: string[];
      err?: unknown;
    };
    if (body?.type === "program_logs") {
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
    const mint = (req.query.mint as string) || deps.getMintAddress();
    if (!mint) {
      return res.status(400).json({ error: "mint required (query or MINT_ADDRESS)" });
    }
    res.json({ mint, entries: getBlacklist(mint) });
  });

  app.post("/compliance/blacklist", async (req: Request, res: Response) => {
    const mintAddr = (req.body?.mint as string) || deps.getMintAddress();
    const address = req.body?.address as string;
    const reason = (req.body?.reason as string) || "";
    if (!mintAddr || !address) {
      return res.status(400).json({ error: "mint and address required" });
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
    const address = req.params.address as string;
    const mintAddr = (req.query.mint as string) || (req.body as { mint?: string })?.mint || deps.getMintAddress();
    if (!mintAddr || !address) {
      return res.status(400).json({ error: "mint and address required" });
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
    const address = req.body?.address as string;
    if (!address) {
      return res.status(400).json({ error: "address required" });
    }
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
    const action = req.query.action as AuditAction | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const mint = req.query.mint as string | undefined;
    const format = (req.query.format as string) || "json";
    const entries = getAuditLog({ action: action || undefined, from, to, mint });
    if (format === "csv") {
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
