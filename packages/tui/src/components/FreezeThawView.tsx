import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { freeze, thaw } from "../api.js";
import * as sdkOps from "../sdkOperations.js";
import { getErrorMessage } from "@stbr/sss-token";

type Props = {
  mint: string;
  mode: "backend" | "standalone";
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

export default function FreezeThawView({ mint, mode, onSuccess, onError }: Props) {
  const [account, setAccount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<"freeze" | "thaw">("freeze");

  useInput(
    (input, key) => {
      if (!mint || submitting) return;
      if (input === "1") setAction("freeze");
      else if (input === "2") setAction("thaw");
      else if (key.leftArrow || key.rightArrow) {
        setAction((a) => (a === "freeze" ? "thaw" : "freeze"));
      }
    },
    { isActive: !submitting }
  );

  const submit = useCallback(async () => {
    if (!account.trim()) return;
    setSubmitting(true);
    try {
      const res =
        mode === "backend"
          ? action === "freeze"
            ? await freeze({ mint, owner: account.trim() })
            : await thaw({ mint, owner: account.trim() })
          : action === "freeze"
            ? await sdkOps.freeze(mint, undefined, account.trim())
            : await sdkOps.thaw(mint, undefined, account.trim());
      onSuccess(res.signature);
      setAccount("");
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [mint, mode, action, onSuccess, onError]);

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
        <Text color="cyan">{action === "freeze" ? "Freezing..." : "Thawing..."}</Text>
      </Box>
    );
  }

  const freezeActive = action === "freeze";
  const thawActive = action === "thaw";

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="row" alignItems="center" gap={2}>
        <Text bold color="cyan">Freeze / Thaw</Text>
        <Box
          borderStyle="round"
          borderColor={freezeActive ? "yellow" : "gray"}
          paddingX={2}
          paddingY={0}
        >
          <Text bold={freezeActive} color={freezeActive ? "yellow" : "gray"}>
            [ 1 ] ❄ Freeze
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor={thawActive ? "green" : "gray"}
          paddingX={2}
          paddingY={0}
        >
          <Text bold={thawActive} color={thawActive ? "green" : "gray"}>
            [ 2 ] ☀ Thaw
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="white">Owner (wallet) pubkey</Text>
        <Text dimColor>ATA derived from mint</Text>
        <Box marginTop={1}>
          <TextInput
            value={account}
            onChange={setAccount}
            onSubmit={submit}
            placeholder="wallet pubkey..."
          />
        </Box>
        <Box marginTop={1}><Text dimColor>Press 1/2 or arrows to switch • Enter to submit</Text></Box>
      </Box>
    </Box>
  );
}
