import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { StatusResponse } from "../api.js";

type Props = {
  mint: string;
  setMint: (m: string) => void;
  status: StatusResponse | null;
  refreshStatus: () => Promise<void>;
};

export default function StatusView({ mint, setMint, status, refreshStatus }: Props) {
  const [input, setInput] = useState(mint);

  const onSubmit = () => {
    const v = input.trim();
    if (v) {
      setMint(v);
      refreshStatus();
    }
  };

  if (!mint) {
    return (
      <Box flexDirection="column">
        <Text>Enter mint address (pubkey):</Text>
        <Box>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={onSubmit}
            placeholder="mint pubkey"
          />
        </Box>
      </Box>
    );
  }

  if (!status) {
    return <Text color="yellow">Loading status...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text>Name: {status.name}</Text>
      <Text>Symbol: {status.symbol}</Text>
      <Text>Preset: {status.preset}</Text>
      <Text>Paused: {status.paused ? "yes" : "no"}</Text>
      <Text>Supply: {status.supply}</Text>
      <Text>Total minted: {status.totalMinted}</Text>
      <Text>Total burned: {status.totalBurned}</Text>
      <Text>Decimals: {status.decimals}</Text>
      <Text>Authority: {status.authority.slice(0, 8)}...{status.authority.slice(-4)}</Text>
    </Box>
  );
}
