import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { getAuditLog, AUDIT_LOG_LIMIT, type AuditEntry } from "../api.js";

type Props = {
  mint?: string;
  mode?: "backend" | "standalone";
};

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return `${str.slice(0, len - 3)}...`;
}

export default function AuditView({ mint, mode = "backend" }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "backend") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getAuditLog(mint, AUDIT_LOG_LIMIT)
      .then((r) => setEntries(r.entries ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [mint, mode]);

  if (mode === "standalone") {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text dimColor>Audit log requires backend. Run with BACKEND_URL set.</Text>
      </Box>
    );
  }

  if (loading) {
    return <Text color="yellow">Loading audit log...</Text>;
  }

  if (error) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1} paddingY={1}>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (entries.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text dimColor>No audit entries yet.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        Audit Log
      </Text>
      <Text dimColor>Last {entries.length} entries (limit {AUDIT_LOG_LIMIT})</Text>
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row" marginBottom={1}>
          <Box width={10}>
            <Text bold dimColor>Time</Text>
          </Box>
          <Box width={14}>
            <Text bold dimColor>Type</Text>
          </Box>
          <Box width={12}>
            <Text bold dimColor>Actor</Text>
          </Box>
          <Box width={12}>
            <Text bold dimColor>Amount</Text>
          </Box>
          <Box>
            <Text bold dimColor>Signature</Text>
          </Box>
        </Box>
        {entries.map((e, i) => (
          <Box key={i} flexDirection="row">
            <Box width={10}>
              <Text dimColor>{formatTime(e.timestamp)}</Text>
            </Box>
            <Box width={14}>
              <Text>{truncate(e.type, 12)}</Text>
            </Box>
            <Box width={12}>
              <Text dimColor>{e.actor ? truncate(e.actor, 10) : "-"}</Text>
            </Box>
            <Box width={12}>
              <Text>{e.amount ?? "-"}</Text>
            </Box>
            <Box>
              <Text dimColor>{e.signature ? truncate(e.signature, 16) : "-"}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
