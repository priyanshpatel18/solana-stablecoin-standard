import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import {
  getHealth,
  getStatus,
  getBackendUrl,
  type StatusResponse,
} from "./api.js";
import StatusView from "./components/StatusView.js";
import MintView from "./components/MintView.js";
import BurnView from "./components/BurnView.js";
import FreezeThawView from "./components/FreezeThawView.js";
import PauseView from "./components/PauseView.js";
import BlacklistView from "./components/BlacklistView.js";
import SeizeView from "./components/SeizeView.js";
import RolesView from "./components/RolesView.js";

const TABS = [
  "Status",
  "Mint",
  "Burn",
  "Freeze/Thaw",
  "Pause",
  "Roles",
  "Blacklist",
  "Seize",
] as const;

export default function App() {
  const [mint, setMint] = useState(
    () => process.env.MINT_ADDRESS ?? ""
  );
  const [tabIndex, setTabIndex] = useState(0);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!mint) {
      setStatus(null);
      return;
    }
    try {
      const s = await getStatus(mint);
      setStatus(s);
      setLastError(null);
    } catch (e) {
      setStatus(null);
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [mint]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getBackendUrl()) {
        setHealthError("BACKEND_URL not set");
        setLoading(false);
        return;
      }
      try {
        const h = await getHealth();
        if (cancelled) return;
        if (h.mint) setMint(h.mint);
      } catch (e) {
        if (!cancelled) setHealthError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
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
        <Text>Connecting to backend...</Text>
      </Box>
    );
  }

  if (healthError) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color="red">{healthError}</Text>
        <Text dimColor>Set BACKEND_URL (and API_KEY if required).</Text>
      </Box>
    );
  }

  const shortMint = mint ? `${mint.slice(0, 8)}...${mint.slice(-4)}` : "none";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>SSS Admin</Text>
        <Text> Mint: {shortMint}</Text>
        {status && (
          <>
            <Text> {status.symbol}</Text>
            <Text> Supply: {status.supply}</Text>
            {status.paused && <Text color="yellow"> Paused</Text>}
          </>
        )}
      </Box>

      <Box marginBottom={1} flexDirection="row">
        {TABS.map((name, i) => (
          <Box key={name} marginRight={1}>
            <Text bold={i === tabIndex} color={i === tabIndex ? "cyan" : undefined}>
              {i === tabIndex ? `[${name}]` : name}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginBottom={1} minHeight={12}>
        {tabIndex === 0 && (
          <StatusView
            mint={mint}
            setMint={setMint}
            status={status}
            refreshStatus={refreshStatus}
          />
        )}
        {tabIndex === 1 && (
          <MintView mint={mint} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 2 && (
          <BurnView mint={mint} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 3 && (
          <FreezeThawView mint={mint} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 4 && (
          <PauseView mint={mint} status={status} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 5 && (
          <RolesView mint={mint} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 6 && (
          <BlacklistView mint={mint} onSuccess={onSuccess} onError={onError} />
        )}
        {tabIndex === 7 && (
          <SeizeView mint={mint} onSuccess={onSuccess} onError={onError} />
        )}
      </Box>

      <Box flexDirection="column">
        {lastError && <Text color="red">{lastError}</Text>}
        {lastSig && (
          <>
            <Text color="green">Last tx: {lastSig.slice(0, 16)}...</Text>
            <Text color="cyan">
              Orb: https://orbmarkets.io/tx/{lastSig}?cluster={process.env.CLUSTER ?? "devnet"}&tab=summary
            </Text>
          </>
        )}
        <Text dimColor>Tab/arrows: switch | Enter: submit</Text>
      </Box>
    </Box>
  );
}
