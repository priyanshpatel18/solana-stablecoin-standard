import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { freeze, thaw } from "../api.js";

type Props = {
  mint: string;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function FreezeThawView({ mint, onSuccess, onError }: Props) {
  const [account, setAccount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<"freeze" | "thaw">("freeze");

  useInput((input) => {
    if (input === "f") setAction("freeze");
    else if (input === "t") setAction("thaw");
  });

  const submit = async () => {
    if (!account.trim()) return;
    setSubmitting(true);
    try {
      const body = { mint, owner: account.trim() };
      const res = action === "freeze" ? await freeze(body) : await thaw(body);
      onSuccess(res.signature);
      setAccount("");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!mint) {
    return <Text color="yellow">Set mint in Status tab first.</Text>;
  }

  if (submitting) {
    return <Text>{action === "freeze" ? "Freezing" : "Thawing"}...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text>Owner (wallet) pubkey:</Text>
      <TextInput
        value={account}
        onChange={setAccount}
        onSubmit={submit}
        placeholder="wallet pubkey (ATA derived from mint)"
      />
      <Text dimColor>Press f=freeze t=thaw (current: {action})</Text>
    </Box>
  );
}
