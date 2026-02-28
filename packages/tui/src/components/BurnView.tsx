import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { burnRequest } from "../api.js";

type Props = {
  mint: string;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function BurnView({ mint, onSuccess, onError }: Props) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!amount.trim()) return;
    setSubmitting(true);
    try {
      const res = await burnRequest({ amount: amount.trim() });
      onSuccess(res.signature);
      setAmount("");
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
    return <Text>Burning...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text>Amount to burn:</Text>
      <TextInput
        value={amount}
        onChange={setAmount}
        onSubmit={submit}
        placeholder="amount"
      />
    </Box>
  );
}
