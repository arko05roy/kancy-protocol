"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DEPLOYMENT, EPOCH_LENGTH, EXPLORER, settler } from "@/lib/contracts";
import { duration, short } from "@/lib/format";
import { useNow, useProtocol } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { Art } from "./fx";
import { TxButton } from "./ui";
import { WalletButton } from "./wallet";

const LINKS = [
  ["/vaults", "Vaults"],
  ["/managers", "Scoreboard"],
  ["/portfolio", "Portfolio"],
  ["/manage", "Manage"],
  ["/curate", "Curate"],
  ["/faucet", "Faucet"],
] as const;

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <ellipse cx="20" cy="20" rx="18" ry="8" strokeWidth="2.2" transform="rotate(-28 20 20)" />
        <ellipse cx="20" cy="20" rx="12" ry="4.6" strokeWidth="1" strokeDasharray="1.5 1.8" transform="rotate(-28 20 20)" />
      </g>
      <path fill="currentColor" d="M20 3l1.5 13.5L28 20l-6.500 3.500L20 37l-1.500-13.500L12 20l6.500-3.500z" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  useEffect(() => setOpen(false), [path]);

  return (
    <header className="nav">
      <nav className="nav-inner" aria-label="Main">
        <Link href="/" className="brand">
          <Mark />
          <span><b>kancy</b><small>PROTOCOL</small></span>
        </Link>
        <div id="nav-links" className={`nav-links ${open ? "open" : ""}`}>
          {LINKS.map(([href, label]) => {
            const on = path === href || path.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}>
                {label}
                {on && <motion.i layoutId="nav-line" className="nav-line" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              </Link>
            );
          })}
        </div>
        <div className="nav-tools">
          <EpochStatus />
          <WalletButton />
          <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="nav-links" aria-label="Menu" onClick={() => setOpen(!open)}>
            <i /><i />
          </button>
        </div>
      </nav>
      <motion.i className="nav-progress" style={{ scaleX: progress }} aria-hidden="true" />
    </header>
  );
}

/** Compact epoch countdown in the navbar. Opens a panel where anyone can settle an ended epoch (PRD §4, Keeper). */
function EpochStatus() {
  const { epoch, endsAt } = useProtocol();
  const now = useNow();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { run } = useTx();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (epoch === undefined || endsAt === undefined || now === 0) return null;
  const left = endsAt - now;
  const ready = left <= 0;
  const done = ready ? 1 : Math.max(0, 1 - left / EPOCH_LENGTH);

  return (
    <div className="epoch" ref={root}>
      <button type="button" className="epoch-pill" aria-expanded={open} aria-controls="epoch-panel" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" className="epoch-track" />
          <circle cx="12" cy="12" r="9" className="epoch-arc" pathLength={100} strokeDasharray={`${done * 100} 100`} />
          {ready && <path className="epoch-spark" d="M12 7l1 4 4 1-4 1-1 4-1-4-4-1 4-1z" />}
        </svg>
        <span><small>Epoch {String(epoch)}</small><b>{ready ? "Ready" : duration(left)}</b></span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div id="epoch-panel" className="epoch-panel" initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.18 }}>
            <h2>Epoch {String(epoch)}</h2>
            <p>{ready ? "This epoch has ended and is waiting to be settled." : `Settlement opens in ${duration(left)}.`}</p>
            <div className="epoch-bar"><i style={{ width: `${done * 100}%` }} /></div>
            <p className="muted small">Settlement values every position, applies losses to Manager stakes first and processes withdrawals. Anyone can run it and earn a small mUSDC bounty.</p>
            {ready && <TxButton label="Settle epoch" onClick={() => run("Settle epoch", { ...settler, functionName: "settleEpoch" })} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <Art name="planet" className="footer-planet" depth={20} />
      <div className="footer-grid">
        <div>
          <p className="footer-line">Managed Uniswap liquidity, backed by the Manager’s own capital.</p>
          <p className="muted">A Uniswap v4 hook and vault system on Unichain Sepolia. Testnet only, unaudited, no real funds.</p>
        </div>
        <dl className="contracts">
          {DEPLOYMENT.map(([label, address]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd><a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">{short(address)} ↗</a></dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
  );
}
