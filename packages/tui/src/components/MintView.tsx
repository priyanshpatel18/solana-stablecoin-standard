import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { mintRequest } from "../api.js";

type Props = {
  mint: string;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function MintView({ mint, onSuccess, onError }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"recipient" | "amount">("recipient");

  const submitMint = async () => {
    if (!recipient.trim() || !amount.trim()) return;
    setSubmitting(true);
    try {
      const res = await mintRequest({
        recipient: recipient.trim(),
        amount: amount.trim(),
      });
      onSuccess(res.signature);
      setRecipient("");
      setAmount("");
      setStep("recipient");
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
    return <Text>Minting...</Text>;
  }

  if (step === "recipient") {
    return (
      <Box flexDirection="column">
        <Text>Recipient (pubkey):</Text>
        <TextInput
          value={recipient}
          onChange={setRecipient}
          onSubmit={() => setStep("amount")}
          placeholder="recipient pubkey"
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
        onSubmit={submitMint}
        placeholder="amount"
      />
    </Box>
  );
}
