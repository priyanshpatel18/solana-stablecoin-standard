import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { rolesGrant } from "../api.js";
import * as sdkOps from "../sdkOperations.js";
import { getErrorMessage } from "@stbr/sss-token";

type Props = {
  mint: string;
  mode: "backend" | "standalone";
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

const ROLES: Array<{ num: number; label: string; field: keyof RolesState }> = [
  { num: 1, label: "Minter", field: "minter" },
  { num: 2, label: "Burner", field: "burner" },
  { num: 3, label: "Pauser", field: "pauser" },
  { num: 4, label: "Freezer", field: "freezer" },
  { num: 5, label: "Blacklister", field: "blacklister" },
  { num: 6, label: "Seizer", field: "seizer" },
];

type RolesState = {
  minter: boolean;
  burner: boolean;
  pauser: boolean;
  freezer: boolean;
  blacklister: boolean;
  seizer: boolean;
};

const defaultRoles: RolesState = {
  minter: false,
  burner: false,
  pauser: false,
  freezer: false,
  blacklister: false,
  seizer: false,
};

export default function RolesView({ mint, mode, onSuccess, onError }: Props) {
  const [holder, setHolder] = useState("");
  const [roles, setRoles] = useState<RolesState>(defaultRoles);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"holder" | "roles">("holder");

  const submit = useCallback(async () => {
    if (!holder.trim()) return;
    const hasAny = roles.minter || roles.burner || roles.pauser || roles.freezer || roles.blacklister || roles.seizer;
    if (!hasAny) {
      onError("Select at least one role (press 1–6 to toggle).");
      return;
    }
    setSubmitting(true);
    try {
      const rolesPayload = {
        minter: roles.minter,
        burner: roles.burner,
        pauser: roles.pauser,
        freezer: roles.freezer,
        blacklister: roles.blacklister,
        seizer: roles.seizer,
      };
      const res =
        mode === "backend"
          ? await rolesGrant(mint, holder.trim(), rolesPayload)
          : await sdkOps.rolesGrant(mint, holder.trim(), rolesPayload);
      onSuccess(res.signature);
      setHolder("");
      setRoles(defaultRoles);
      setStep("holder");
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [mint, mode, holder, roles, onSuccess, onError]);

  useInput(
    (input, key) => {
      if (step !== "roles" || submitting) return;
      if (key.return) {
        const hasAny = roles.minter || roles.burner || roles.pauser || roles.freezer || roles.blacklister || roles.seizer;
        if (hasAny) submit();
        return;
      }
      const n = parseInt(input, 10);
      if (n >= 1 && n <= 6) {
        const r = ROLES[n - 1];
        if (r) setRoles((prev) => ({ ...prev, [r.field]: !prev[r.field] }));
      }
    },
    { isActive: step === "roles" && !submitting }
  );

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
        <Text color="cyan">Granting roles...</Text>
      </Box>
    );
  }

  if (step === "holder") {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Grant Roles</Text>
        <Text dimColor>Holder (pubkey to grant roles to)</Text>
        <Box marginTop={1}>
          <TextInput
            value={holder}
            onChange={setHolder}
            onSubmit={() => setStep("roles")}
            placeholder="holder pubkey..."
          />
        </Box>
        <Box marginTop={1}><Text dimColor>Enter to continue</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Grant Roles</Text>
        <Text color="gray"> ─ </Text>
        <Text color="white">Holder: {holder.slice(0, 8)}...{holder.slice(-4)}</Text>
      </Box>

      <Box flexDirection="row" flexWrap="wrap">
        {ROLES.map((r, i) => {
          const active = roles[r.field];
          return (
            <Box
              key={r.field}
              marginRight={i < ROLES.length - 1 ? 1 : 0}
              marginBottom={1}
              borderStyle="round"
              borderColor={active ? "green" : "gray"}
              paddingX={2}
              paddingY={0}
            >
              <Text bold={active} color={active ? "green" : "gray"}>
                [ {r.num} ] {active ? "✓" : " "} {r.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Press 1–6 to toggle • Enter to grant (authority signs)
        </Text>
      </Box>
    </Box>
  );
}
