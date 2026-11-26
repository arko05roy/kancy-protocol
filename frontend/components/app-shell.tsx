"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EXPLORER, DEPLOYMENT } from "@/lib/contracts";
import { EpochStatus, Mark } from "./chrome";
import { WalletButton } from "./wallet";

type Item = { href: string; label: string; icon: ReactNode };

const I = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  vault: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3.5" /><path d="M12 8.5V7M12 17v-1.5" /></>,
  wallet: <><path d="M3 7a2 2 0 0 1 2-2h13v4" /><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="16.5" cy="13.5" r="1.2" /></>,
  board: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
};

const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: I.home },
    { href: "/portfolio", label: "Portfolio", icon: I.wallet },
  ] },
  { title: "Markets", items: [
    { href: "/vaults", label: "Vaults", icon: I.vault },
    { href: "/managers", label: "Scoreboard", icon: I.board },
  ] },
  { title: "Operate", items: [
    { href: "/manage", label: "Manager console", icon: I.sliders },
    { href: "/curate", label: "Curator tools", icon: I.layers },
  ] },
  { title: "Testnet", items: [
    { href: "/faucet", label: "Faucet", icon: I.drop },
  ] },
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="side-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const current = GROUPS.flatMap((g) => g.items).find((i) => path === i.href || path.startsWith(`${i.href}/`));
  const hook = DEPLOYMENT[0];

  return (
    <div className={`shell ${open ? "shell-open" : ""}`}>
      <aside className="side" aria-label="App">
        <Link href="/" className="brand side-brand">
          <Mark />
          <span><b>kancy</b><small>PROTOCOL</small></span>
        </Link>
        <nav className="side-nav">
          {GROUPS.map((g) => (
            <div key={g.title} className="side-group">
              <p className="side-title">{g.title}</p>
              {g.items.map((i) => {
                const on = current?.href === i.href;
                return (
                  <Link key={i.href} href={i.href} className="side-link" aria-current={on ? "page" : undefined}>
                    <Icon>{i.icon}</Icon>{i.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <p><i className="dot" aria-hidden="true" />Unichain Sepolia</p>
          {hook && <a href={`${EXPLORER}/address/${hook[1]}`} target="_blank" rel="noreferrer">Contracts on explorer ↗</a>}
          <Link href="/">Back to site</Link>
        </div>
      </aside>
      <button type="button" className="side-scrim" aria-label="Close menu" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} />

      <div className="shell-main">
        <header className="topbar">
          <button type="button" className="nav-toggle side-toggle" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
            <i /><i />
          </button>
          <p className="topbar-crumb"><span>App</span><span aria-hidden="true">/</span><b>{current?.label ?? "Dashboard"}</b></p>
          <div className="nav-tools">
            <EpochStatus />
            <WalletButton />
          </div>
        </header>
        <main id="main" className="shell-content">{children}</main>
      </div>
    </div>
  );
}
