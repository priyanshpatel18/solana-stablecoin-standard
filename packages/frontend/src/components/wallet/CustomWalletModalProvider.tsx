"use client";

import { WalletModalContext } from "@solana/wallet-adapter-react-ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { CustomWalletModal } from "./CustomWalletModal";

export function CustomWalletModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  return (
    <WalletModalContext.Provider value={{ visible, setVisible }}>
      {children}
      {visible && <CustomWalletModal />}
    </WalletModalContext.Provider>
  );
}
