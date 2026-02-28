import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { pause, unpause } from "../api.js";
import type { StatusResponse } from "../api.js";

type Props = {
  mint: string;
  status: StatusResponse | null;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function PauseView({ mint, status, onSuccess, onError }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const run = async (isPause: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = isPause ? await pause(mint) : await unpause(mint);
      onSuccess(res.signature);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  useInput((input) => {
    if (!mint || submitting) return;
    if (input === "p") run(true);
    else if (input === "u") run(false);
  });

  if (!mint) {
    return <Text color="yellow">Set mint in Status tab first.</Text>;
  }

  if (submitting) {
    return <Text>Submitting...</Text>;
  }

  const paused = status?.paused ?? false;

  return (
    <Box flexDirection="column">
      <Text>Mint is {paused ? "paused" : "unpaused"}.</Text>
      <Text dimColor>Press P to pause, U to unpause.</Text>
    </Box>
  );
}
