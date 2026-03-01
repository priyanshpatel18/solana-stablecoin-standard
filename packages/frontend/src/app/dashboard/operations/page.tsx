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

export default function OperationsPage() {
  const { mint, backendUrl, callBackend, isAuthority } = useMint();
  const [mintRecipient, setMintRecipient] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [freezeOwner, setFreezeOwner] = useState("");
  const [thawOwner, setThawOwner] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipient = mintRecipient.trim();
    const amount = mintAmount.trim();
    if (!recipient || !amount) {
      toast.error("Recipient and amount required");
      return;
    }
    if (Number(amount) <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    if (!backendUrl) {
      toast.error("Configure NEXT_PUBLIC_BACKEND_URL");
      return;
    }
    setPending("mint");
    const result = await callBackend("/mint-request", { recipient, amount });
    setPending(null);
    showResult(result.signature, result.error);
    if (result.signature) {
      setMintRecipient("");
      setMintAmount("");
    }
  };

  const handleBurn = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = burnAmount.trim();
    if (!amount) {
      toast.error("Amount required");
      return;
    }
    if (Number(amount) <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    if (!backendUrl) {
      toast.error("Configure NEXT_PUBLIC_BACKEND_URL");
      return;
    }
    setPending("burn");
    const result = await callBackend("/burn-request", { amount });
    setPending(null);
    showResult(result.signature, result.error);
    if (result.signature) setBurnAmount("");
  };

  const handleFreeze = async (e: React.FormEvent) => {
    e.preventDefault();
    const owner = freezeOwner.trim();
    if (!owner) {
      toast.error("Owner or token account required");
      return;
    }
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    setPending("freeze");
    const result = await callBackend("/operations/freeze", { owner });
    setPending(null);
    showResult(result.signature, result.error);
    if (result.signature) setFreezeOwner("");
  };

  const handleThaw = async (e: React.FormEvent) => {
    e.preventDefault();
    const owner = thawOwner.trim();
    if (!owner) {
      toast.error("Owner or token account required");
      return;
    }
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    setPending("thaw");
    const result = await callBackend("/operations/thaw", { owner });
    setPending(null);
    showResult(result.signature, result.error);
    if (result.signature) setThawOwner("");
  };

  const handlePause = async () => {
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    setPending("pause");
    const result = await callBackend("/operations/pause", {});
    setPending(null);
    showResult(result.signature, result.error);
  };

  const handleUnpause = async () => {
    if (!mint) {
      toast.error("Mint address required");
      return;
    }
    setPending("unpause");
    const result = await callBackend("/operations/unpause", {});
    setPending(null);
    showResult(result.signature, result.error);
  };

  if (!backendUrl) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold mb-4">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Configure NEXT_PUBLIC_BACKEND_URL for mint, burn, freeze, thaw, pause.
        </p>
      </div>
    );
  }

  const disabled = !isAuthority || !!pending;

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-semibold">Operations</h1>

      {!isAuthority && (
        <p className="text-sm text-destructive font-medium">
          Authority required for this action
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Mint</CardTitle>
          <p className="text-xs text-muted-foreground">
            Recipient pubkey and amount (decimal).
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMint} className="flex flex-col gap-3">
            <Input
              placeholder="Recipient pubkey"
              value={mintRecipient}
              onChange={(e) => setMintRecipient(e.target.value)}
              className="font-mono text-sm"
            />
            <Input
              type="text"
              placeholder="Amount"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" disabled={disabled}>
              {pending === "mint" ? "Submitting..." : "Mint"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Burn</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBurn} className="flex flex-col gap-3">
            <Input
              type="text"
              placeholder="Amount"
              value={burnAmount}
              onChange={(e) => setBurnAmount(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" disabled={disabled}>
              {pending === "burn" ? "Submitting..." : "Burn"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Freeze</CardTitle>
          <p className="text-xs text-muted-foreground">
            Owner pubkey (ATA derived) or token account pubkey.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFreeze} className="flex flex-col gap-3">
            <Input
              placeholder="Owner or token account"
              value={freezeOwner}
              onChange={(e) => setFreezeOwner(e.target.value)}
              className="font-mono text-sm"
            />
            <Button type="submit" disabled={disabled}>
              {pending === "freeze" ? "Submitting..." : "Freeze"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Thaw</CardTitle>
          <p className="text-xs text-muted-foreground">
            Owner pubkey (ATA derived) or token account pubkey.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleThaw} className="flex flex-col gap-3">
            <Input
              placeholder="Owner or token account"
              value={thawOwner}
              onChange={(e) => setThawOwner(e.target.value)}
              className="font-mono text-sm"
            />
            <Button type="submit" disabled={disabled}>
              {pending === "thaw" ? "Submitting..." : "Thaw"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Pause / Unpause</CardTitle>
          <p className="text-xs text-muted-foreground">
            Uses current mint from header.
          </p>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={handlePause}
            disabled={disabled}
          >
            {pending === "pause" ? "Submitting..." : "Pause"}
          </Button>
          <Button
            type="button"
            onClick={handleUnpause}
            disabled={disabled}
          >
            {pending === "unpause" ? "Submitting..." : "Unpause"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
