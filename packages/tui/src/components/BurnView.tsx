import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { validateBurnAmount, getErrorMessage } from "@stbr/sss-token";
import { burnRequest } from "../api.js";
import * as sdkOps from "../sdkOperations.js";

type Props = {
  mint: string;
  mode: "backend" | "standalone";
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function BurnView({ mint, mode, onSuccess, onError }: Props) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!amount.trim()) return;
    const amt = amount.trim();
    const err = validateBurnAmount(amt);
    if (err) {
      onError(err);
      return;
    }
    setSubmitting(true);
    try {
      const res =
        mode === "backend"
          ? await burnRequest({ amount: amt })
          : await sdkOps.burn(mint, amt);
      onSuccess(res.signature);
      setAmount("");
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!mint) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="yellow">Set mint in Status tab first (or press Shift+M to change).</Text>
      </Box>
    );
  }

  if (submitting) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="cyan">Burning...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Burn Tokens</Text>
      <Text dimColor>Amount to burn from signer</Text>
      <Box marginTop={1}>
        <TextInput
          value={amount}
          onChange={setAmount}
          onSubmit={submit}
          placeholder="amount"
        />
      </Box>
      <Box marginTop={1}><Text dimColor>Enter to submit</Text></Box>
    </Box>
  );
}
