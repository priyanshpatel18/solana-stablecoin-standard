import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { validateMintAmount, getErrorMessage } from "@stbr/sss-token";
import { mintRequest } from "../api.js";
import * as sdkOps from "../sdkOperations.js";

type Props = {
  mint: string;
  mode: "backend" | "standalone";
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function MintView({ mint, mode, onSuccess, onError }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"recipient" | "amount">("recipient");

  const submitMint = async () => {
    if (!recipient.trim() || !amount.trim()) return;
    const amt = amount.trim();
    const err = validateMintAmount(amt);
    if (err) {
      onError(err);
      return;
    }
    setSubmitting(true);
    try {
      const res =
        mode === "backend"
          ? await mintRequest({ recipient: recipient.trim(), amount: amt })
          : await sdkOps.mint(mint, recipient.trim(), amt);
      onSuccess(res.signature);
      setRecipient("");
      setAmount("");
      setStep("recipient");
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
        <Text color="cyan">Minting...</Text>
      </Box>
    );
  }

  if (step === "recipient") {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Mint Tokens</Text>
        <Text dimColor>Step 1 of 2: Recipient</Text>
        <Box marginTop={1}>
          <TextInput
            value={recipient}
            onChange={setRecipient}
            onSubmit={() => setStep("amount")}
            placeholder="recipient pubkey..."
          />
        </Box>
        <Box marginTop={1}><Text dimColor>Enter to continue</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Mint Tokens</Text>
      <Text dimColor>Step 2 of 2: Amount</Text>
      <Box marginTop={1}>
        <TextInput
          value={amount}
          onChange={setAmount}
          onSubmit={submitMint}
          placeholder="amount"
        />
      </Box>
      <Box marginTop={1}><Text dimColor>Enter to submit</Text></Box>
    </Box>
  );
}
