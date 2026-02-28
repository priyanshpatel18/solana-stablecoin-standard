import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { pause, unpause } from "../api.js";
import * as sdkOps from "../sdkOperations.js";
import type { StatusResponse } from "../api.js";

type Props = {
  mint: string;
  status: StatusResponse | null;
  mode: "backend" | "standalone";
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function PauseView({ mint, status, mode, onSuccess, onError }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [highlighted, setHighlighted] = useState<"pause" | "unpause">("pause");

  const run = useCallback(
    async (isPause: boolean) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const res =
          mode === "backend"
            ? isPause ? await pause(mint) : await unpause(mint)
            : isPause ? await sdkOps.pause(mint) : await sdkOps.unpause(mint);
        onSuccess(res.signature);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
    },
    [mint, mode, onSuccess, onError, submitting]
  );

  useInput(
    (input, key) => {
      if (!mint || submitting) return;
      if (input === "1") {
        run(true);
      } else if (input === "2") {
        run(false);
      } else if (key.leftArrow || key.rightArrow) {
        setHighlighted((h) => (h === "pause" ? "unpause" : "pause"));
      } else if (key.return) {
        run(highlighted === "pause");
      }
    },
    { isActive: !submitting }
  );

  if (!mint) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="yellow">Set mint in Status tab first (or press Shift+M to change).</Text>
      </Box>
    );
  }

  const paused = status?.paused ?? false;

  if (submitting) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="cyan">Submitting {paused ? "unpause" : "pause"}...</Text>
      </Box>
    );
  }

  const pauseActive = highlighted === "pause";
  const unpauseActive = highlighted === "unpause";

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="row" alignItems="center">
        <Text bold color="cyan">Pause / Unpause</Text>
        <Text color="gray"> ─ </Text>
        <Text color={paused ? "yellow" : "green"}>
          {paused ? "⏸ Paused" : "▶ Active"}
        </Text>
      </Box>

      <Box flexDirection="row" gap={2}>
        <Box
          borderStyle="round"
          borderColor={pauseActive ? "yellow" : paused ? "gray" : "cyan"}
          paddingX={2}
          paddingY={1}
        >
          <Text bold={pauseActive} color={pauseActive ? "yellow" : paused ? "gray" : "white"}>
            [ 1 ]  ⏸  Pause
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor={unpauseActive ? "green" : !paused ? "gray" : "cyan"}
          paddingX={2}
          paddingY={1}
        >
          <Text bold={unpauseActive} color={unpauseActive ? "green" : !paused ? "gray" : "white"}>
            [ 2 ]  ▶  Unpause
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Press 1 or 2 to execute • Arrows to highlight • Enter to confirm
        </Text>
      </Box>
    </Box>
  );
}
