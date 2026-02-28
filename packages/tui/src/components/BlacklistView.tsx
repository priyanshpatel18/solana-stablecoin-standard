import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  getBlacklist,
  blacklistAdd,
  blacklistRemove,
  type BlacklistEntry,
} from "../api.js";

type Props = {
  mint: string;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function BlacklistView({ mint, onSuccess, onError }: Props) {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "add" | "remove">("list");
  const [addAddress, setAddAddress] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!mint) {
      setLoading(false);
      return;
    }
    getBlacklist(mint)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [mint]);

  const refresh = () => {
    if (!mint) return;
    getBlacklist(mint).then((r) => setEntries(r.entries));
  };

  useInput((input, key) => {
    if (key.escape) {
      setMode("list");
      setAddAddress("");
      setRemoveAddress("");
      return;
    }
    if (mode === "list" && !submitting) {
      if (input.toLowerCase() === "a") setMode("add");
      else if (input.toLowerCase() === "r") setMode("remove");
    }
  });

  const handleAdd = async () => {
    if (!addAddress.trim()) return;
    setSubmitting(true);
    try {
      const res = await blacklistAdd(mint, addAddress.trim());
      onSuccess(res.signature);
      setAddAddress("");
      setMode("list");
      refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeAddress.trim()) return;
    setSubmitting(true);
    try {
      const res = await blacklistRemove(mint, removeAddress.trim());
      onSuccess(res.signature);
      setRemoveAddress("");
      setMode("list");
      refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!mint) {
    return <Text color="yellow">Set mint in Status tab first.</Text>;
  }

  if (loading) {
    return <Text>Loading blacklist...</Text>;
  }

  if (mode === "add") {
    if (submitting) return <Text>Adding...</Text>;
    return (
      <Box flexDirection="column">
        <Text>Address to add (Enter to submit, Esc to cancel):</Text>
        <TextInput
          value={addAddress}
          onChange={setAddAddress}
          onSubmit={() => (addAddress.trim() ? handleAdd() : setMode("list"))}
          placeholder="pubkey"
        />
      </Box>
    );
  }

  if (mode === "remove") {
    if (submitting) return <Text>Removing...</Text>;
    return (
      <Box flexDirection="column">
        <Text>Address to remove:</Text>
        <TextInput
          value={removeAddress}
          onChange={setRemoveAddress}
          onSubmit={() => (removeAddress.trim() ? handleRemove() : setMode("list"))}
          placeholder="pubkey"
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Blacklist ({entries.length})</Text>
      {entries.length === 0 && <Text dimColor>No entries.</Text>}
      {entries.slice(0, 10).map((e) => (
        <Text key={e.address}>
          {e.address.slice(0, 8)}... {e.reason ?? ""}
        </Text>
      ))}
      {entries.length > 10 && <Text dimColor>... and {entries.length - 10} more</Text>}
      <Text dimColor>Press A to add, R to remove (or use Enter on list to switch)</Text>
    </Box>
  );
}
