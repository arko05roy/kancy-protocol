"use client";

import { ConnectButton, darkTheme, type Theme } from "@rainbow-me/rainbowkit";
import { chain } from "@/lib/contracts";

const base = darkTheme({
  accentColor: "#f4f4f2",
  accentColorForeground: "#000000",
  borderRadius: "large",
  overlayBlur: "small",
  fontStack: "system",
});

/** RainbowKit in the brand's monochrome. */
export const walletTheme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: "#0a0a0a",
    modalBorder: "rgba(244,244,242,0.4)",
    modalBackdrop: "rgba(0,0,0,0.76)",
    generalBorder: "rgba(244,244,242,0.2)",
    menuItemBackground: "rgba(244,244,242,0.09)",
    connectButtonBackground: "#000000",
    profileForeground: "#0a0a0a",
    connectionIndicator: "#f4f4f2",
  },
  fonts: { body: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" },
  shadows: { ...base.shadows, dialog: "0 0 70px rgba(244,244,242,0.1)" },
};

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain: current, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        const connected = mounted && !!account && !!current;
        const wrong = connected && (current.unsupported || current.id !== chain.id);
        return (
          <button type="button" className={`btn btn-small wallet-btn ${connected && !wrong ? "" : "btn-solid"}`}
            onClick={!connected ? openConnectModal : wrong ? openChainModal : openAccountModal}>
            {connected && !wrong && <i className="dot" aria-hidden="true" />}
            <span>{!connected ? <>Connect<span className="wallet-long"> wallet</span></> : wrong ? "Wrong network" : account.displayName}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/** Inline "Connect wallet" button for empty states and forms. */
export function ConnectPrompt({ small, solid = true }: { small?: boolean; solid?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <button type="button" className={`btn ${solid ? "btn-solid" : ""} ${small ? "btn-small" : ""}`} onClick={openConnectModal}>
          Connect wallet
        </button>
      )}
    </ConnectButton.Custom>
  );
}
