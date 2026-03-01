"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { MintContextProvider, useMint } from "@/context/MintContext";
import { Input } from "@/components/ui/input";
import { CopyableAddress } from "@/components/CopyableAddress";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/operations", label: "Operations" },
  { href: "/dashboard/compliance", label: "Compliance" },
  { href: "/dashboard/roles", label: "Roles" },
  { href: "/dashboard/audit", label: "Audit" },
];

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mint, setMint } = useMint();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar: refined, subtle */}
      <aside className="w-52 shrink-0 border-r border-sidebar-border flex flex-col bg-sidebar text-sidebar-foreground rounded-r-xl">
        <div className="p-4 border-b border-sidebar-border flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="SSS"
            width={200}
            height={50}
            className="shrink-0"
          />
        </div>
        <nav className="p-2 flex flex-col gap-0.5">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Floating header bar */}
        <header className="sticky top-0 z-10 flex justify-center px-2 pt-2 sm:pt-4 sm:px-4">
          <div className="w-full max-w-5xl rounded-xl border border-border bg-card/80 backdrop-blur-md shadow-sm">
            <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <Input
                placeholder="Mint address"
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                className="max-w-md font-mono text-sm bg-background/50"
              />
              {mint && (
                <CopyableAddress value={mint} kind="address" className="shrink-0" />
              )}
              <div className="ml-auto shrink-0">
                <WalletConnectButton />
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MintContextProvider>
      <DashboardShell>{children}</DashboardShell>
    </MintContextProvider>
  );
}
