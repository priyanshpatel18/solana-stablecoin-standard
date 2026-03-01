"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, getProgram } from "@stbr/sss-token";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

const MINT_ENV = process.env.NEXT_PUBLIC_MINT ?? "";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export interface Status {
  mint: string;
  authority?: string;
  name: string;
  symbol: string;
  decimals: number;
  paused: boolean;
  totalMinted: string;
  totalBurned: string;
  supply: string;
  preset: string;
}

interface MintContextValue {
  mint: string;
  setMint: (mint: string) => void;
  status: Status | null;
  fetchStatus: (mintAddr: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  backendUrl: string;
  isAuthority: boolean;
  callBackend: (
    path: string,
    body: Record<string, unknown>,
    method?: "POST" | "PUT" | "DELETE"
  ) => Promise<{ signature?: string; error?: string }>;
}

const MintContext = createContext<MintContextValue | null>(null);

export function MintContextProvider({ children }: { children: React.ReactNode }) {
  const { publicKey } = useWallet();
  const [mint, setMint] = useState(MINT_ENV);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async (mintAddr: string) => {
    if (!mintAddr) return;
    setLoading(true);
    setError(null);
    try {
      if (BACKEND_URL) {
        const res = await fetch(
          `${BACKEND_URL.replace(/\/$/, "")}/status/${mintAddr}`
        );
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setStatus({
          mint: data.mint,
          authority: data.authority,
          name: data.name ?? "",
          symbol: data.symbol ?? "",
          decimals: data.decimals ?? 0,
          paused: data.paused ?? false,
          totalMinted: data.totalMinted ?? "0",
          totalBurned: data.totalBurned ?? "0",
          supply: data.supply ?? "0",
          preset: data.preset ?? "SSS-1",
        });
      } else {
        const rpc =
          process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
        const connection = new Connection(rpc);
        const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
        const { Keypair } = await import("@solana/web3.js");
        const dummyWallet = new Wallet(Keypair.generate());
        const provider = new AnchorProvider(connection, dummyWallet, {});
        const program = getProgram(provider);
        const stable = await SolanaStablecoin.load(
          program as never,
          new PublicKey(mintAddr)
        );
        const state = await stable.getState();
        const supply = await stable.getTotalSupply();
        const authority = state.authority?.toBase58?.() ?? undefined;
        setStatus({
          mint: state.mint.toBase58(),
          authority,
          name: state.name ?? "",
          symbol: state.symbol ?? "",
          decimals: state.decimals ?? 0,
          paused: state.paused ?? false,
          totalMinted: state.total_minted?.toString?.() ?? "0",
          totalBurned: state.total_burned?.toString?.() ?? "0",
          supply: supply?.toString?.() ?? "0",
          preset: stable.isSSS2() ? "SSS-2" : "SSS-1",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mint) fetchStatus(mint);
  }, [mint, fetchStatus]);

  const isAuthority = Boolean(
    status?.authority && publicKey && status.authority === publicKey.toBase58()
  );

  const callBackend = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      method: "POST" | "PUT" | "DELETE" = "POST"
    ) => {
      if (!BACKEND_URL) {
        return { error: "Configure NEXT_PUBLIC_BACKEND_URL for admin actions" };
      }
      const needsMint =
        path.includes("freeze") ||
        path.includes("thaw") ||
        path.includes("pause") ||
        path.includes("seize") ||
        path.includes("blacklist");
      if (needsMint && !mint) {
        return { error: "Mint address required" };
      }
      try {
        const payload =
          path.includes("mint-request") || path.includes("burn-request")
            ? body
            : { mint, ...body };
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const apiKey = process.env.NEXT_PUBLIC_API_KEY;
        if (apiKey) headers["X-API-Key"] = apiKey;
        const res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}${path}`, {
          method,
          headers,
          body:
            method === "POST" || method === "PUT"
              ? JSON.stringify(payload)
              : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        const sig = data.signature ?? data.sig;
        if (sig && mint) await fetchStatus(mint);
        return { signature: sig ?? undefined };
      } catch (e) {
        return {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
    [mint, fetchStatus]
  );

  return (
    <MintContext.Provider
      value={{
        mint,
        setMint,
        status,
        fetchStatus,
        loading,
        error,
        backendUrl: BACKEND_URL,
        isAuthority,
        callBackend,
      }}
    >
      {children}
    </MintContext.Provider>
  );
}

export function useMint() {
  const ctx = useContext(MintContext);
  if (!ctx) throw new Error("useMint must be used within MintContextProvider");
  return ctx;
}
