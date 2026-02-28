const BACKEND_URL = process.env.BACKEND_URL ?? "";
const API_KEY = process.env.API_KEY ?? "";

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: object } = {}
): Promise<T> {
  const url = `${BACKEND_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: headers(),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = { error: text || res.statusText };
  }
  if (!res.ok) {
    const err = data as { error?: string; details?: unknown };
    const msg = err?.error ?? `HTTP ${res.status}`;
    const detailsStr = err?.details ? ` ${JSON.stringify(err.details)}` : "";
    throw new Error(msg + detailsStr);
  }
  return data as T;
}

export interface HealthResponse {
  status: string;
  rpc?: string;
  mint?: string | null;
  compliance?: boolean;
}

export interface StatusResponse {
  mint: string;
  authority: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  paused: boolean;
  totalMinted: string;
  totalBurned: string;
  supply: string;
  preset: "SSS-1" | "SSS-2";
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

export interface SignatureResponse {
  success: boolean;
  signature: string;
}

export interface BlacklistEntry {
  address: string;
  reason?: string;
  addedAt: string;
}

export interface BlacklistResponse {
  mint: string;
  entries: BlacklistEntry[];
}

export interface AuditEntry {
  timestamp: string;
  type: string;
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

export interface AuditLogResponse {
  entries: AuditEntry[];
}

export async function getAuditLog(mint?: string, limit = 50): Promise<AuditLogResponse> {
  const params = new URLSearchParams({ format: "json" });
  if (mint) params.set("mint", mint);
  const data = await request<AuditLogResponse>(
    `/compliance/audit-log?${params.toString()}`
  );
  if (data.entries && limit > 0) {
    data.entries = data.entries.slice(0, limit);
  }
  return data;
}

export function getBackendUrl(): string {
  return BACKEND_URL;
}

export function hasApiKey(): boolean {
  return Boolean(API_KEY);
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export async function getStatus(mint: string): Promise<StatusResponse> {
  return request<StatusResponse>(`/status/${encodeURIComponent(mint)}`);
}

export async function mintRequest(body: {
  recipient: string;
  amount: number | string;
  minter?: string;
}): Promise<SignatureResponse> {
  return request<SignatureResponse>("/mint-request", {
    method: "POST",
    body,
  });
}

export async function burnRequest(body: {
  amount: number | string;
  burner?: string;
}): Promise<SignatureResponse> {
  return request<SignatureResponse>("/burn-request", {
    method: "POST",
    body,
  });
}

export async function freeze(body: { mint: string; account?: string; owner?: string }): Promise<SignatureResponse> {
  return request<SignatureResponse>("/operations/freeze", {
    method: "POST",
    body,
  });
}

export async function thaw(body: { mint: string; account?: string; owner?: string }): Promise<SignatureResponse> {
  return request<SignatureResponse>("/operations/thaw", {
    method: "POST",
    body,
  });
}

export async function pause(mint: string): Promise<SignatureResponse> {
  return request<SignatureResponse>("/operations/pause", {
    method: "POST",
    body: { mint },
  });
}

export async function unpause(mint: string): Promise<SignatureResponse> {
  return request<SignatureResponse>("/operations/unpause", {
    method: "POST",
    body: { mint },
  });
}

export async function getBlacklist(mint: string): Promise<BlacklistResponse> {
  return request<BlacklistResponse>(`/compliance/blacklist?mint=${encodeURIComponent(mint)}`);
}

export async function blacklistAdd(
  mint: string,
  address: string,
  reason?: string
): Promise<SignatureResponse> {
  return request<SignatureResponse>("/compliance/blacklist", {
    method: "POST",
    body: { mint, address, reason },
  });
}

export async function blacklistRemove(mint: string, address: string): Promise<SignatureResponse> {
  return request<SignatureResponse>(
    `/compliance/blacklist/${encodeURIComponent(address)}?mint=${encodeURIComponent(mint)}`,
    { method: "DELETE" }
  );
}

export async function seize(body: {
  mint: string;
  from: string;
  to: string;
  amount: number | string;
}): Promise<SignatureResponse> {
  return request<SignatureResponse>("/operations/seize", {
    method: "POST",
    body,
  });
}

export async function rolesGrant(
  mint: string,
  holder: string,
  roles: { minter?: boolean; burner?: boolean; pauser?: boolean; freezer?: boolean; blacklister?: boolean; seizer?: boolean }
): Promise<SignatureResponse> {
  return request<SignatureResponse>("/operations/roles", {
    method: "POST",
    body: {
      mint,
      holder,
      roles: {
        minter: roles.minter ?? false,
        burner: roles.burner ?? false,
        pauser: roles.pauser ?? false,
        freezer: roles.freezer ?? false,
        blacklister: roles.blacklister ?? false,
        seizer: roles.seizer ?? false,
      },
    },
  });
}
