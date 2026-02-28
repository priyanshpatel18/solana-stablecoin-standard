import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  getBlacklist,
  blacklistAdd,
  blacklistRemove,
  type BlacklistEntry,
} from "../api.js";
import * as sdkOps from "../sdkOperations.js";
import { getErrorMessage } from "@stbr/sss-token";

type Props = {
  mint: string;
  mode: "backend" | "standalone";
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function BlacklistView({ mint, mode, onSuccess, onError }: Props) {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "add" | "remove">("list");
  const [addAddress, setAddAddress] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!mint || mode !== "backend") {
      setLoading(false);
      return;
    }
    getBlacklist(mint)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [mint, mode]);

  const refresh = useCallback(() => {
    if (!mint || mode !== "backend") return;
    getBlacklist(mint).then((r) => setEntries(r.entries));
  }, [mint, mode]);

  useInput(
    (input, key) => {
      if (key.escape) {
        setViewMode("list");
        setAddAddress("");
        setRemoveAddress("");
        return;
      }
      if (viewMode === "list" && !submitting) {
        if (input === "1") setViewMode("add");
        else if (input === "2") setViewMode("remove");
      }
    },
    { isActive: !submitting }
  );

  const handleAdd = useCallback(async () => {
    if (!addAddress.trim()) return;
    setSubmitting(true);
    try {
      const res =
        mode === "backend"
          ? await blacklistAdd(mint, addAddress.trim())
          : await sdkOps.blacklistAdd(mint, addAddress.trim());
      onSuccess(res.signature);
      setAddAddress("");
      setViewMode("list");
      refresh();
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [mint, mode, addAddress, onSuccess, onError, refresh]);

  const handleRemove = useCallback(async () => {
    if (!removeAddress.trim()) return;
    setSubmitting(true);
    try {
      const res =
        mode === "backend"
          ? await blacklistRemove(mint, removeAddress.trim())
          : await sdkOps.blacklistRemove(mint, removeAddress.trim());
      onSuccess(res.signature);
      setRemoveAddress("");
      setViewMode("list");
      refresh();
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [mint, mode, removeAddress, onSuccess, onError, refresh]);

  if (!mint) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="yellow">Set mint in Status tab first (or press Shift+M to change).</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="cyan">Loading blacklist...</Text>
      </Box>
    );
  }

  if (viewMode === "add") {
    if (submitting) {
      return (
        <Box flexDirection="column" paddingY={1}>
          <Text color="cyan">Adding to blacklist...</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Add to Blacklist</Text>
        <Text dimColor>Address to blacklist</Text>
        <Box marginTop={1}>
          <TextInput
            value={addAddress}
            onChange={setAddAddress}
            onSubmit={() => (addAddress.trim() ? handleAdd() : setViewMode("list"))}
            placeholder="pubkey..."
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to submit • Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (viewMode === "remove") {
    if (submitting) {
      return (
        <Box flexDirection="column" paddingY={1}>
          <Text color="cyan">Removing from blacklist...</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Remove from Blacklist</Text>
        <Text dimColor>Address to remove</Text>
        <Box marginTop={1}>
          <TextInput
            value={removeAddress}
            onChange={setRemoveAddress}
            onSubmit={() => (removeAddress.trim() ? handleRemove() : setViewMode("list"))}
            placeholder="pubkey..."
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to submit • Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Blacklist</Text>
        <Text color="gray"> ─ </Text>
        {mode === "backend" ? (
          <Text color="white">{entries.length} entries</Text>
        ) : (
          <Text dimColor>Add/remove only (list requires backend)</Text>
        )}
      </Box>

      <Box flexDirection="row">
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
          marginRight={2}
        >
          <Text color="white">[ 1 ] Add</Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
        >
          <Text color="white">[ 2 ] Remove</Text>
        </Box>
      </Box>

      {mode === "backend" && entries.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>No entries.</Text>
        </Box>
      )}
      {mode === "backend" && entries.slice(0, 10).map((e) => (
        <Box key={e.address} marginTop={0}>
          <Text color="white">{e.address.slice(0, 8)}...</Text>
          <Text color="gray"> {e.reason ?? ""}</Text>
        </Box>
      ))}
      {mode === "backend" && entries.length > 10 && (
        <Box marginTop={1}>
          <Text dimColor>... and {entries.length - 10} more</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press 1 to add, 2 to remove • Esc to cancel</Text>
      </Box>
    </Box>
  );
}
