import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  getHealth,
  getStatus,
  getBackendUrl,
  type StatusResponse,
} from "./api.js";
import { loadConfig, saveConfig } from "./config.js";
import StatusView from "./components/StatusView.js";
import MintView from "./components/MintView.js";
import BurnView from "./components/BurnView.js";
import FreezeThawView from "./components/FreezeThawView.js";
import PauseView from "./components/PauseView.js";
import BlacklistView from "./components/BlacklistView.js";
import SeizeView from "./components/SeizeView.js";
import RolesView from "./components/RolesView.js";
import AuditView from "./components/AuditView.js";

const TABS = [
  "Status",
  "Mint",
  "Burn",
  "Freeze/Thaw",
  "Pause",
  "Roles",
  "Blacklist",
  "Seize",
  "Audit",
] as const;

export default function App() {
  const [mint, setMint] = useState(() => {
    const envMint = process.env.MINT_ADDRESS ?? "";
    if (envMint) return envMint;
    const cfg = loadConfig();
    return cfg.mint ?? "";
  });
  const [tabIndex, setTabIndex] = useState(0);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusSource, setStatusSource] = useState<"backend" | "rpc" | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [editingMint, setEditingMint] = useState(false);
  const [mintInput, setMintInput] = useState(mint);

  const hasBackend = Boolean(getBackendUrl());

  useEffect(() => {
    setMintInput(mint);
  }, [mint]);

  const refreshStatus = useCallback(async () => {
    if (!mint) {
      setStatus(null);
      setStatusSource(null);
      return;
    }
    if (hasBackend) {
      try {
        const s = await getStatus(mint);
        setStatus(s);
        setStatusSource("backend");
        setLastError(null);
        setLastRefreshedAt(new Date());
      } catch (e) {
        try {
          const { fetchStatusFromRpc } = await import("./rpcStatus.js");
          const s = await fetchStatusFromRpc(mint);
          setStatus(s);
          setStatusSource("rpc");
          setLastError(null);
          setLastRefreshedAt(new Date());
        } catch (rpcErr) {
          setStatusSource(null);
          setLastError(e instanceof Error ? e.message : String(e));
        }
      }
    } else {
      try {
        const { fetchStatus } = await import("./sdkOperations.js");
        const s = await fetchStatus(mint);
        setStatus(s);
        setStatusSource("rpc");
        setLastError(null);
        setLastRefreshedAt(new Date());
      } catch (e) {
        setStatusSource(null);
        setLastError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [mint, hasBackend]);

const STATUS_POLL_INTERVAL_MS = 5000;

  useEffect(() => {
    if (!mint || loading) return;
    const id = setInterval(refreshStatus, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [mint, loading, refreshStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasBackend) {
        try {
          const h = await getHealth();
          if (cancelled) return;
          if (h.mint && !mint) setMint(h.mint);
        } catch (e) {
          if (!cancelled) setHealthError(e instanceof Error ? e.message : String(e));
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mint || loading) return;
    refreshStatus();
  }, [mint, loading, refreshStatus]);

  useInput((input, key) => {
    if (editingMint) {
      if (key.escape) {
        setEditingMint(false);
        setMintInput(mint);
      }
      return;
    }
    if (input === "M") {
      setMintInput(mint);
      setEditingMint(true);
      return;
    }
    if (key.leftArrow) {
      setTabIndex((i) => (i === 0 ? TABS.length - 1 : i - 1));
    } else if (key.rightArrow) {
      setTabIndex((i) => (i === TABS.length - 1 ? 0 : i + 1));
    } else if (key.tab && !key.shift) {
      setTabIndex((i) => (i === TABS.length - 1 ? 0 : i + 1));
    } else if (key.tab && key.shift) {
      setTabIndex((i) => (i === 0 ? TABS.length - 1 : i - 1));
    }
  });

  const handleMintChange = useCallback(
    (newMint: string) => {
      const v = newMint.trim();
      if (v) {
        setMint(v);
        saveConfig({ mint: v });
        setEditingMint(false);
        refreshStatus();
      }
    },
    [refreshStatus]
  );

  const onSuccess = useCallback((sig: string) => {
    setLastSig(sig);
    setLastError(null);
    refreshStatus();
  }, [refreshStatus]);

  const onError = useCallback((msg: string) => {
    setLastError(msg);
    setLastSig(null);
  }, []);

  if (loading) {
    return (
      <Box padding={1}>
        <Text>{hasBackend ? "Connecting to backend..." : "Starting standalone..."}</Text>
      </Box>
    );
  }

  if (healthError) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color="red">{healthError}</Text>
        <Text dimColor>Set BACKEND_URL (and API_KEY if required), or run in standalone mode.</Text>
      </Box>
    );
  }

  const mode: "backend" | "standalone" = hasBackend ? "backend" : "standalone";

  const shortMint = mint ? `${mint.slice(0, 8)}...${mint.slice(-4)}` : "none";
  const lastRefreshStr = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "Never";

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1} marginBottom={1}>
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center">
            <Text bold color="cyan">
              SSS Admin
            </Text>
            <Text color="gray"> ─ </Text>
            {editingMint ? (
              <Box>
                <Text color="yellow">Change mint: </Text>
                <TextInput
                  value={mintInput}
                  onChange={setMintInput}
                  onSubmit={handleMintChange}
                  placeholder="pubkey..."
                  showCursor
                />
                <Text dimColor> Enter=apply Esc=cancel</Text>
              </Box>
            ) : (
              <>
                <Text color="gray">Mint: </Text>
                <Text color="white" bold>{shortMint}</Text>
                <Text dimColor> [Shift+M to change]</Text>
                {status && (
                  <>
                    <Text color="gray"> │ </Text>
                    <Text bold color="green">{status.symbol}</Text>
                    <Text color="gray"> Supply: </Text>
                    <Text color="white">{status.supply}</Text>
                    {status.paused && (
                      <Text color="yellow" bold> │ ⏸ Paused</Text>
                    )}
                    {mode === "standalone" && (
                      <Text dimColor> │ Standalone</Text>
                    )}
                    {mode === "backend" && statusSource === "rpc" && (
                      <Text dimColor> │ via RPC</Text>
                    )}
                  </>
                )}
              </>
            )}
          </Box>
        </Box>
      </Box>

      <Box marginBottom={1} flexDirection="row" flexWrap="wrap">
        {TABS.map((name, i) => (
          <Box key={name} marginRight={1}>
            <Text
              bold={i === tabIndex}
              color={i === tabIndex ? "cyan" : "gray"}
              inverse={i === tabIndex}
            >
              {i === tabIndex ? ` ${name} ` : ` ${name} `}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginBottom={1} minHeight={12} borderStyle="round" borderColor="gray" paddingX={2} paddingY={1}>
        {tabIndex === 0 && (
          <StatusView
            mint={mint}
            setMint={setMint}
            onMintChange={(m) => saveConfig({ mint: m })}
            status={status}
            refreshStatus={refreshStatus}
          />
        )}
        {tabIndex === 1 && (
          <MintView mint={mint} mode={mode} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 2 && (
          <BurnView mint={mint} mode={mode} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 3 && (
          <FreezeThawView mint={mint} mode={mode} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 4 && (
          <PauseView mint={mint} status={status} mode={mode} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 5 && (
          <RolesView mint={mint} mode={mode} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 6 && (
          <BlacklistView mint={mint} mode={mode} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 7 && (
          <SeizeView mint={mint} mode={mode} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 8 && <AuditView mint={mint || undefined} mode={mode} />}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {lastError && (
          <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1} marginBottom={1}>
            <Text color="red" bold>✗ Error</Text>
            <Text color="red">{lastError}</Text>
          </Box>
        )}
        {lastSig && (
          <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} marginBottom={1}>
            <Text color="green" bold>✓ Last tx</Text>
            <Text color="white">{lastSig.slice(0, 16)}...</Text>
            <Text dimColor color="gray">
              Orb: https://orbmarkets.io/tx/{lastSig}?cluster={process.env.CLUSTER ?? "devnet"}&tab=summary
            </Text>
          </Box>
        )}
        <Box flexDirection="row" marginTop={1}>
          <Text dimColor>Tab/arrows: switch</Text>
          <Text dimColor color="gray"> │ </Text>
          <Text dimColor>Enter: submit</Text>
          <Text dimColor color="gray"> │ </Text>
          <Text dimColor>Shift+M: change mint</Text>
          <Text dimColor color="gray"> │ </Text>
          <Text dimColor>Last refresh: {lastRefreshStr}</Text>
        </Box>
      </Box>
    </Box>
  );
}
