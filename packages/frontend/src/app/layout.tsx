import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./WalletProvider";

export const metadata: Metadata = {
  title: "SSS Stablecoin Admin",
  description: "Solana Stablecoin Standard example frontend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-zinc-950 text-zinc-100">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
