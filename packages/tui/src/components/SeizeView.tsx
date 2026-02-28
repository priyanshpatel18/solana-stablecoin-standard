import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { seize } from "../api.js";

type Props = {
  mint: string;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function SeizeView({ mint, onSuccess, onError }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"from" | "to" | "amount">("from");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!from.trim() || !to.trim() || !amount.trim()) return;
    setSubmitting(true);
    try {
      const res = await seize({
        mint,
        from: from.trim(),
        to: to.trim(),
        amount: amount.trim(),
      });
      onSuccess(res.signature);
      setFrom("");
      setTo("");
      setAmount("");
      setStep("from");
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
    return <Text>Seizing...</Text>;
  }

  if (step === "from") {
    return (
      <Box flexDirection="column">
        <Text>From (owner pubkey):</Text>
        <TextInput
          value={from}
          onChange={setFrom}
          onSubmit={() => setStep("to")}
          placeholder="source owner pubkey"
        />
      </Box>
    );
  }

  if (step === "to") {
    return (
      <Box flexDirection="column">
        <Text>To (owner pubkey):</Text>
        <TextInput
          value={to}
          onChange={setTo}
          onSubmit={() => setStep("amount")}
          placeholder="destination owner pubkey"
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Amount:</Text>
      <TextInput
        value={amount}
        onChange={setAmount}
        onSubmit={submit}
        placeholder="amount"
      />
    </Box>
  );
}
