import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { rolesGrant } from "../api.js";

type Props = {
  mint: string;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
};

const ROLE_KEYS: Array<{ key: string; label: string; field: keyof RolesState }> = [
  { key: "m", label: "Minter", field: "minter" },
  { key: "b", label: "Burner", field: "burner" },
  { key: "p", label: "Pauser", field: "pauser" },
  { key: "l", label: "Blacklister", field: "blacklister" },
  { key: "z", label: "Seizer", field: "seizer" },
];

type RolesState = {
  minter: boolean;
  burner: boolean;
  pauser: boolean;
  blacklister: boolean;
  seizer: boolean;
};

const defaultRoles: RolesState = {
  minter: false,
  burner: false,
  pauser: false,
  blacklister: false,
  seizer: false,
};

export default function RolesView({ mint, onSuccess, onError }: Props) {
  const [holder, setHolder] = useState("");
  const [roles, setRoles] = useState<RolesState>(defaultRoles);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"holder" | "roles">("holder");

  useInput((input, key) => {
    if (step !== "roles") return;
    if (key.return) {
      const hasAny = roles.minter || roles.burner || roles.pauser || roles.blacklister || roles.seizer;
      if (hasAny) submit();
      return;
    }
    const r = ROLE_KEYS.find((x) => x.key === input.toLowerCase());
    if (r) {
      setRoles((prev) => ({ ...prev, [r.field]: !prev[r.field] }));
    }
  });

  const submit = async () => {
    if (!holder.trim()) return;
    const hasAny = roles.minter || roles.burner || roles.pauser || roles.blacklister || roles.seizer;
    if (!hasAny) {
      onError("Select at least one role (m/b/p/l/z).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await rolesGrant(mint, holder.trim(), {
        minter: roles.minter,
        burner: roles.burner,
        pauser: roles.pauser,
        blacklister: roles.blacklister,
        seizer: roles.seizer,
      });
      onSuccess(res.signature);
      setHolder("");
      setRoles(defaultRoles);
      setStep("holder");
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
    return <Text>Granting roles...</Text>;
  }

  if (step === "holder") {
    return (
      <Box flexDirection="column">
        <Text>Holder (pubkey to grant roles to):</Text>
        <TextInput
          value={holder}
          onChange={setHolder}
          onSubmit={() => setStep("roles")}
          placeholder="holder pubkey"
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Holder: {holder}</Text>
      <Text>Toggles: m=Minter b=Burner p=Pauser l=Blacklister z=Seizer</Text>
      <Text>
        {" "}
        [{roles.minter ? "x" : " "}] Minter [{roles.burner ? "x" : " "}] Burner [{roles.pauser ? "x" : " "}] Pauser [
        {roles.blacklister ? "x" : " "}] Blacklister [{roles.seizer ? "x" : " "}] Seizer
      </Text>
      <Text dimColor>Press keys to toggle, Enter to grant (authority signs).</Text>
    </Box>
  );
}
