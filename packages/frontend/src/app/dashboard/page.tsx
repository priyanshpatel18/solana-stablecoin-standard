"use client";

import { useMint } from "@/context/MintContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyableAddress } from "@/components/CopyableAddress";

export default function DashboardOverviewPage() {
  const { status, loading, error } = useMint();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Overview</h1>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-medium text-muted-foreground">Status</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {status && !loading && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Mint</dt>
              <dd>
                {status.mint ? (
                  <CopyableAddress value={status.mint} kind="address" />
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">Authority</dt>
              <dd>
                {status.authority ? (
                  <CopyableAddress value={status.authority} kind="address" />
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">Name</dt>
              <dd>{status.name}</dd>
              <dt className="text-muted-foreground">Symbol</dt>
              <dd>{status.symbol}</dd>
              <dt className="text-muted-foreground">Decimals</dt>
              <dd>{status.decimals}</dd>
              <dt className="text-muted-foreground">Paused</dt>
              <dd>{status.paused ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Preset</dt>
              <dd>{status.preset}</dd>
              <dt className="text-muted-foreground">Total Minted</dt>
              <dd>{status.totalMinted}</dd>
              <dt className="text-muted-foreground">Total Burned</dt>
              <dd>{status.totalBurned}</dd>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-medium text-muted-foreground">Supply</h2>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-mono">{status?.supply ?? "—"}</p>
        </CardContent>
      </Card>
    </div>
  );
}
