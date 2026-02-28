"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, getProgram } from "@stbr/sss-token";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const MINT_ENV = process.env.NEXT_PUBLIC_MINT ?? "";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

interface Status {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  paused: boolean;
  totalMinted: string;
  totalBurned: string;
  supply: string;
  preset: string;
}

export default function Home() {
  const { publicKey, connected } = useWallet();
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
        const res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/status/${mintAddr}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setStatus({
          mint: data.mint,
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
        const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
        const connection = new Connection(rpc);
        const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
        const { Keypair } = await import("@solana/web3.js");
        const dummyWallet = new Wallet(Keypair.generate());
        const provider = new AnchorProvider(connection, dummyWallet, {});
        const program = getProgram(provider);
        const stable = await SolanaStablecoin.load(program as never, new PublicKey(mintAddr));
        const state = await stable.getState();
        const supply = await stable.getTotalSupply();
        setStatus({
          mint: state.mint.toBase58(),
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

  const handleAction = async (
    path: string,
    body: Record<string, unknown>,
    method = "POST"
  ): Promise<string | null> => {
    if (!BACKEND_URL) {
      setError("Configure NEXT_PUBLIC_BACKEND_URL for admin actions");
      return null;
    }
    if (!mint && (path.includes("freeze") || path.includes("thaw") || path.includes("pause") || path.includes("seize") || path.includes("blacklist"))) {
      setError("Mint address required");
      return null;
    }
    setError(null);
    try {
      const payload = (path.includes("mint-request") || path.includes("burn-request")) ? body : { mint, ...body };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const apiKey = process.env.NEXT_PUBLIC_API_KEY;
      if (apiKey) headers["X-API-Key"] = apiKey;
      const res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}${path}`, {
        method,
        headers,
        body: (method === "POST" || method === "PUT") ? JSON.stringify(payload) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const sig = data.signature ?? data.sig;
      if (sig) {
        await fetchStatus(mint);
        return sig;
      }
      return null;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">SSS Stablecoin Admin</h1>

      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Wallet</h2>
        <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-500" />
        {connected && publicKey && (
          <p className="mt-2 text-sm text-zinc-500 truncate">{publicKey.toBase58()}</p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Mint</h2>
        <input
          type="text"
          placeholder="Mint address or use NEXT_PUBLIC_MINT"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
        />
      </section>

      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Status</h2>
        {loading && <p className="text-zinc-500 text-sm">Loading...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {status && !loading && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-zinc-500">Name</dt>
            <dd>{status.name}</dd>
            <dt className="text-zinc-500">Symbol</dt>
            <dd>{status.symbol}</dd>
            <dt className="text-zinc-500">Decimals</dt>
            <dd>{status.decimals}</dd>
            <dt className="text-zinc-500">Paused</dt>
            <dd>{status.paused ? "Yes" : "No"}</dd>
            <dt className="text-zinc-500">Preset</dt>
            <dd>{status.preset}</dd>
            <dt className="text-zinc-500">Total Minted</dt>
            <dd>{status.totalMinted}</dd>
            <dt className="text-zinc-500">Total Burned</dt>
            <dd>{status.totalBurned}</dd>
          </dl>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Supply</h2>
        <p className="text-lg font-mono">{status?.supply ?? "—"}</p>
      </section>

      {BACKEND_URL ? (
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-2">Actions</h2>
          <p className="text-xs text-zinc-500 mb-3">
            Backend: {BACKEND_URL}
          </p>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              label="Mint"
              onClick={() => {
                const recipient = prompt("Recipient pubkey");
                const amount = prompt("Amount");
                if (recipient && amount)
                  handleAction("/mint-request", { recipient, amount });
              }}
            />
            <ActionButton
              label="Burn"
              onClick={() => {
                const amount = prompt("Amount");
                if (amount) handleAction("/burn-request", { amount });
              }}
            />
            <ActionButton
              label="Freeze"
              onClick={() => {
                const owner = prompt("Owner pubkey");
                if (owner) handleAction("/operations/freeze", { owner });
              }}
            />
            <ActionButton
              label="Thaw"
              onClick={() => {
                const owner = prompt("Owner pubkey");
                if (owner) handleAction("/operations/thaw", { owner });
              }}
            />
            <ActionButton
              label="Pause"
              onClick={() => handleAction("/operations/pause", {})}
            />
            <ActionButton
              label="Unpause"
              onClick={() => handleAction("/operations/unpause", {})}
            />
            {status?.preset === "SSS-2" && (
              <>
                <ActionButton
                  label="Blacklist Add"
                  onClick={() => {
                    const address = prompt("Address");
                    const reason = prompt("Reason") ?? "CLI";
                    if (address) handleAction("/compliance/blacklist", { address, reason });
                  }}
                />
                <ActionButton
                  label="Blacklist Remove"
                  onClick={() => {
                    const address = prompt("Address");
                    if (address)
                      handleAction(`/compliance/blacklist/${encodeURIComponent(address)}?mint=${encodeURIComponent(mint || "")}`, {}, "DELETE");
                  }}
                />
                <ActionButton
                  label="Seize"
                  onClick={() => {
                    const from = prompt("Source owner pubkey");
                    const to = prompt("Destination owner pubkey");
                    const amount = prompt("Amount (placeholder)") ?? "0";
                    if (from && to) handleAction("/operations/seize", { from, to, amount });
                  }}
                />
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-zinc-800 p-4">
          <p className="text-sm text-zinc-500">
            Configure NEXT_PUBLIC_BACKEND_URL for admin actions (mint, burn, freeze, thaw, pause, blacklist, seize).
          </p>
        </section>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
    >
      {label}
    </button>
  );
}
