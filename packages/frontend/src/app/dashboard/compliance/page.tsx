"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMint } from "@/context/MintContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableAddress } from "@/components/CopyableAddress";

function showResult(signature?: string, error?: string) {
  if (error) {
    toast.error(error);
    return;
  }
  if (signature) {
    toast.success("Success", {
      description: <CopyableAddress value={signature} kind="tx" />,
    });
  }
}

export default function CompliancePage() {
  const { mint, backendUrl, status, callBackend, isAuthority } = useMint();
  const [blacklistAddress, setBlacklistAddress] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");
  const [removeAddress, setRemoveAddress] = useState("");
  const [seizeFrom, setSeizeFrom] = useState("");
  const [seizeTo, setSeizeTo] = useState("");
  const [seizeAmount, setSeizeAmount] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const isSSS2 = status?.preset === "SSS-2";
  const disabled = !isAuthority || !!pending;

  const handleBlacklistAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = blacklistAddress.trim();
    if (!address) {
      toast.error("Address required");
      return;
    }
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    setPending("blacklist-add");
    const result = await callBackend("/compliance/blacklist", {
      address,
      reason: blacklistReason.trim() || undefined,
    });
    setPending(null);
    showResult(result.signature, result.error);
    if (result.signature) {
      setBlacklistAddress("");
      setBlacklistReason("");
    }
  };

  const handleBlacklistRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = removeAddress.trim();
    if (!address) {
      toast.error("Address required");
      return;
    }
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    setPending("blacklist-remove");
    const result = await callBackend(
      `/compliance/blacklist/${encodeURIComponent(address)}?mint=${encodeURIComponent(mint)}`,
      {},
      "DELETE"
    );
    setPending(null);
    showResult(result.signature, result.error);
    if (result.signature) setRemoveAddress("");
  };

  const handleSeize = async (e: React.FormEvent) => {
    e.preventDefault();
    const from = seizeFrom.trim();
    const to = seizeTo.trim();
    const amount = seizeAmount.trim() || "0";
    if (!from || !to) {
      toast.error("From and to owner pubkeys required");
      return;
    }
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    setPending("seize");
    const result = await callBackend("/operations/seize", { from, to, amount });
    setPending(null);
    showResult(result.signature, result.error);
    if (result.signature) {
      setSeizeFrom("");
      setSeizeTo("");
      setSeizeAmount("");
    }
  };

  if (!backendUrl) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold mb-4">Compliance</h1>
        <p className="text-sm text-muted-foreground">
          Configure NEXT_PUBLIC_BACKEND_URL for blacklist and seize.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-semibold">Compliance</h1>

      {!isAuthority && isSSS2 && (
        <p className="text-sm text-destructive font-medium">
          Authority required for this action
        </p>
      )}

      {isSSS2 ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Blacklist add</CardTitle>
              <p className="text-xs text-muted-foreground">
                Address and optional reason.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBlacklistAdd} className="flex flex-col gap-3">
                <Input
                  placeholder="Address"
                  value={blacklistAddress}
                  onChange={(e) => setBlacklistAddress(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="Reason (optional)"
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                />
                <Button type="submit" disabled={disabled}>
                  {pending === "blacklist-add" ? "Submitting..." : "Add"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Blacklist remove</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleBlacklistRemove}
                className="flex flex-col gap-3"
              >
                <Input
                  placeholder="Address"
                  value={removeAddress}
                  onChange={(e) => setRemoveAddress(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button type="submit" disabled={disabled}>
                  {pending === "blacklist-remove" ? "Submitting..." : "Remove"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Seize</CardTitle>
              <p className="text-xs text-muted-foreground">
                Source owner, destination owner, amount (for audit).
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSeize} className="flex flex-col gap-3">
                <Input
                  placeholder="From owner pubkey"
                  value={seizeFrom}
                  onChange={(e) => setSeizeFrom(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="To owner pubkey"
                  value={seizeTo}
                  onChange={(e) => setSeizeTo(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  type="text"
                  placeholder="Amount (audit)"
                  value={seizeAmount}
                  onChange={(e) => setSeizeAmount(e.target.value)}
                  className="font-mono"
                />
                <Button type="submit" disabled={disabled}>
                  {pending === "seize" ? "Submitting..." : "Seize"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Blacklist and seize are available for SSS-2 mints. Select an SSS-2
          mint in the header.
        </p>
      )}
    </div>
  );
}
