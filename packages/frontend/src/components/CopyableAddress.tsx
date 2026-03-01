"use client";

import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explorerLinks, truncate } from "@/lib/explorer";
import { toast } from "sonner";

type Kind = "address" | "tx";

export function CopyableAddress({
  value,
  kind = "address",
  showLinks = true,
  className,
}: {
  value: string;
  kind?: Kind;
  showLinks?: boolean;
  className?: string;
}) {
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed")
    );
  };

  const links = showLinks ? explorerLinks(value, kind) : [];

  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${className ?? ""}`}>
      <span className="font-mono text-sm">{truncate(value)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={copy}
        aria-label="Copy"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      {links.map(({ name, url }) => (
        <a
          key={name}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary text-xs inline-flex items-center gap-0.5"
          aria-label={`Open on ${name}`}
        >
          <ExternalLink className="h-3 w-3" />
          {name}
        </a>
      ))}
    </span>
  );
}
