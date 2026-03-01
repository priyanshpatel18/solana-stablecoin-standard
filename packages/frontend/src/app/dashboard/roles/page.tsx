"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMint } from "@/context/MintContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableAddress } from "@/components/CopyableAddress";

const ROLES = [
  "minter",
  "burner",
  "pauser",
  "freezer",
  "blacklister",
  "seizer",
] as const;

export default function RolesPage() {
  const { mint, backendUrl, callBackend, isAuthority } = useMint();
  const [holder, setHolder] = useState("");
  const [roles, setRoles] = useState<Record<string, boolean>>({
    minter: false,
    burner: false,
    pauser: false,
    freezer: false,
    blacklister: false,
    seizer: false,
  });
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const holderTrim = holder.trim();
    if (!holderTrim) {
      toast.error("Holder pubkey required");
      return;
    }
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    if (!backendUrl) {
      toast.error("Configure NEXT_PUBLIC_BACKEND_URL");
      return;
    }
    setPending(true);
    const result = await callBackend("/operations/roles", {
      holder: holderTrim,
      roles,
    });
    setPending(false);
    if (result.error) toast.error(result.error);
    else if (result.signature) {
      toast.success("Success", {
        description: <CopyableAddress value={result.signature} kind="tx" />,
      });
    }
  };

  if (!backendUrl) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold mb-4">Roles</h1>
        <p className="text-sm text-muted-foreground">
          Configure NEXT_PUBLIC_BACKEND_URL to manage roles.
        </p>
      </div>
    );
  }

  const disabled = !isAuthority || pending;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Roles</h1>

      {!isAuthority && (
        <p className="text-sm text-destructive font-medium">
          Authority required for this action
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Grant or update roles</CardTitle>
          <p className="text-xs text-muted-foreground">
            Holder pubkey and role toggles. Omitted roles are set to false.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              placeholder="Holder pubkey"
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-4">
              {ROLES.map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={roles[role] ?? false}
                    onChange={(e) =>
                      setRoles((r) => ({ ...r, [role]: e.target.checked }))
                    }
                    className="rounded border-input"
                  />
                  {role}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={disabled}>
              {pending ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
