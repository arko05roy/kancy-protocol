import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { chain } from "./contracts";

// WalletConnect (QR and mobile wallets) needs a free project ID from https://cloud.reown.com.
// Without one, browser-extension wallets and Coinbase Wallet still work.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: projectId
        ? [metaMaskWallet, rabbyWallet, rainbowWallet, coinbaseWallet, walletConnectWallet, injectedWallet]
        : [injectedWallet, coinbaseWallet],
    },
  ],
  { appName: "Kancy Protocol", projectId: projectId ?? "walletconnect-disabled" },
);

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors, // EIP-6963 wallets installed in the browser are listed automatically
  transports: { [chain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.unichain.org", { batch: true }) },
  batch: { multicall: { wait: 24 } },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
