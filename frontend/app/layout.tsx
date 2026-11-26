import type { Metadata, Viewport } from "next";
import { Courier_Prime, Geist, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Sky } from "@/components/fx";
import { Providers } from "./providers";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

const display = Courier_Prime({ subsets: ["latin"], weight: "700", variable: "--font-display" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Kancy Protocol: managed liquidity with first-loss cover", template: "%s · Kancy Protocol" },
  description: "Managed Uniswap v4 liquidity where each Manager’s own stake absorbs losses before depositors do.",
};
export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <Providers>
          <Sky />
          {children}
        </Providers>
      </body>
    </html>
  );
}
