"use client";

import { useState, useEffect } from "react";
import { useMint } from "@/context/MintContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableAddress } from "@/components/CopyableAddress";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

interface AuditEntry {
  timestamp: string;
  type: string;
  signature?: string;
  mint?: string;
  address?: string;
  targetAddress?: string;
  amount?: string;
  reason?: string;
  actor?: string;
}

export default function AuditPage() {
  const { mint } = useMint();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!BACKEND_URL || !mint) {
      setEntries([]);
      setError(!BACKEND_URL ? "Configure NEXT_PUBLIC_BACKEND_URL" : null);
      return;
    }
    setError(null);
    setLoading(true);
    const url = `${BACKEND_URL.replace(/\/$/, "")}/compliance/audit-log?mint=${encodeURIComponent(mint)}`;
    const headers: Record<string, string> = {};
    const apiKey = process.env.NEXT_PUBLIC_API_KEY;
    if (apiKey) headers["X-API-Key"] = apiKey;
    fetch(url, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data) => setEntries(data.entries ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [mint]);

  if (!BACKEND_URL) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold mb-4">Audit</h1>
        <p className="text-sm text-muted-foreground">
          Configure NEXT_PUBLIC_BACKEND_URL to load the audit log.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Audit</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Audit log</CardTitle>
          <p className="text-xs text-muted-foreground">
            Entries for current mint. Newest first.
          </p>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {!loading && !error && entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No entries. Select a mint and ensure backend is running.
            </p>
          )}
          {!loading && !error && entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                      Time
                    </th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                      Type
                    </th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                      Signature
                    </th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                      Address
                    </th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                      Amount
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-medium">
                      Actor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">
                        {e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-4">{e.type}</td>
                      <td className="py-2 pr-4 max-w-[200px]">
                        {e.signature ? (
                          <CopyableAddress value={e.signature} kind="tx" className="text-xs" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4 max-w-[200px]">
                        {e.address || e.targetAddress ? (
                          <CopyableAddress
                            value={e.address ?? e.targetAddress ?? ""}
                            kind="address"
                            className="text-xs"
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4">{e.amount ?? "—"}</td>
                      <td className="py-2 max-w-[200px]">
                        {e.actor ? (
                          <CopyableAddress
                            value={e.actor}
                            kind="address"
                            className="text-xs"
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
