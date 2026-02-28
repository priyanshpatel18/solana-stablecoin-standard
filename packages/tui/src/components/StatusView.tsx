import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { StatusResponse } from "../api.js";

type Props = {
  mint: string;
  setMint: (m: string) => void;
  onMintChange?: (m: string) => void;
  status: StatusResponse | null;
  refreshStatus: () => Promise<void>;
};

export default function StatusView({ mint, setMint, onMintChange, status, refreshStatus }: Props) {
  const [input, setInput] = useState(mint);

  useEffect(() => {
    setInput(mint);
  }, [mint]);

  const onSubmit = () => {
    const v = input.trim();
    if (v) {
      setMint(v);
      onMintChange?.(v);
      refreshStatus();
    }
  };

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Mint Address</Text>
        <Text dimColor>Or press Shift+M from header to change</Text>
        <Box marginTop={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={onSubmit}
            placeholder="pubkey..."
          />
        </Box>
        <Box marginTop={1}><Text dimColor>Enter to apply</Text></Box>
      </Box>

      {mint && !status && (
        <Box marginTop={1}>
          <Text color="yellow">Loading status...</Text>
        </Box>
      )}

      {mint && status && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} marginTop={1}>
          <Text bold color="white">Status</Text>
          <Box flexDirection="column" marginTop={1} gap={0}>
            <Text><Text color="gray">Name:</Text>     <Text color="white">{status.name}</Text></Text>
            <Text><Text color="gray">Symbol:</Text>   <Text color="green" bold>{status.symbol}</Text></Text>
            <Text><Text color="gray">Preset:</Text>   <Text color="white">{status.preset}</Text></Text>
            <Text>
              <Text color="gray">Paused:</Text>   <Text color={status.paused ? "yellow" : "green"}>{status.paused ? "⏸ yes" : "▶ no"}</Text>
            </Text>
            <Text><Text color="gray">Supply:</Text>   <Text color="white">{status.supply}</Text></Text>
            <Text><Text color="gray">Minted:</Text>   <Text color="white">{status.totalMinted}</Text></Text>
            <Text><Text color="gray">Burned:</Text>   <Text color="white">{status.totalBurned}</Text></Text>
            <Text><Text color="gray">Decimals:</Text> <Text color="white">{status.decimals}</Text></Text>
            <Text><Text color="gray">Authority:</Text> <Text color="white">{status.authority.slice(0, 8)}...{status.authority.slice(-4)}</Text></Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
