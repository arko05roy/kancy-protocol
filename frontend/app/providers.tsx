"use client";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { walletTheme } from "@/components/wallet";
import { chain } from "@/lib/contracts";
import { TxProvider } from "@/lib/tx";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="user">
          <RainbowKitProvider theme={walletTheme} initialChain={chain} modalSize="compact" appInfo={{ appName: "Kancy Protocol" }}>
            <TxProvider>{children}</TxProvider>
          </RainbowKitProvider>
        </MotionConfig>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
