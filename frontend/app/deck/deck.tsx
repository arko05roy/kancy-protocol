"use client";

import Link from "next/link";
import { animate, motion, useInView, useScroll, useSpring, type Variants } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** In print mode every slide renders in its final state, for PDF export. */
const Print = createContext(false);
import { Mark } from "@/components/chrome";

/* ------------------------------------------------------------------ motion
   Each slide is the single in-view trigger. Children animate from the
   slide's "show" state, so masked lines never need to be visible to start. */

const ease = [0.16, 1, 0.3, 1] as const;

const lineV: Variants = {
  hidden: { y: "110%" },
  show: (d: number = 0) => ({ y: "0%", transition: { duration: 0.9, delay: d, ease } }),
};
const fadeV: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (d: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.8, delay: d, ease } }),
};
const numV: Variants = {
  hidden: { opacity: 0, scale: 0.94, filter: "blur(16px)" },
  show: (d: number = 0) => ({ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 1.1, delay: d, ease } }),
};
const growV: Variants = {
  hidden: { scaleY: 0 },
  show: (d: number = 0) => ({ scaleY: 1, transition: { duration: 1.2, delay: d, ease } }),
};
const growXV: Variants = {
  hidden: { scaleX: 0 },
  show: (d: number = 0) => ({ scaleX: 1, transition: { duration: 1.1, delay: d, ease } }),
};
const drawV: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (d: number = 0) => ({ pathLength: 1, opacity: 1, transition: { duration: 1.6, delay: d, ease: "easeInOut" } }),
};

function Line({ children, d = 0 }: { children: ReactNode; d?: number }) {
  return <span className="dk-line"><motion.span variants={lineV} custom={d}>{children}</motion.span></span>;
}
function Fade({ children, d = 0, className = "" }: { children: ReactNode; d?: number; className?: string }) {
  return <motion.div className={className} variants={fadeV} custom={d}>{children}</motion.div>;
}
function Num({ children, d = 0, className = "" }: { children: ReactNode; d?: number; className?: string }) {
  return <motion.p className={`dk-num ${className}`} variants={numV} custom={d}>{children}</motion.p>;
}

/** Counts up each time it comes into view. */
function Count({ to, digits = 0 }: { to: number; digits?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { amount: 0.4 });
  const print = useContext(Print);
  const [v, setV] = useState(print ? to : 0);
  useEffect(() => {
    if (print) return;
    if (!seen) { setV(0); return; }
    const c = animate(0, to, { duration: 1.6, delay: 0.25, ease, onUpdate: setV });
    return () => c.stop();
  }, [seen, to, print]);
  return <span ref={ref}>{v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}

function Slide({ n, label, source, children, className = "" }: { n: number; label: string; source?: string; children: ReactNode; className?: string }) {
  const print = useContext(Print);
  return (
    <motion.section className={`dk-slide ${className}`} data-slide={n} aria-label={label}
      initial={print ? "show" : "hidden"} whileInView="show" viewport={{ once: false, amount: 0.45 }}>
      <motion.p className="dk-kicker" variants={fadeV}><span>{String(n).padStart(2, "0")}</span>{label}</motion.p>
      <div className="dk-body">{children}</div>
      {source && <motion.p className="dk-source" variants={fadeV} custom={0.8}>Source · {source}</motion.p>}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ visuals */

/** Exchange price moves; the pool lags in steps; hatched gaps are what arbitrage takes from LPs. */
function LvrChart() {
  const cex = [[0, 250], [100, 232], [200, 186], [300, 176], [400, 128], [500, 116], [600, 72], [700, 62], [800, 40]];
  const cexD = cex.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const pool = "M0 250 H200 V186 H400 V128 H600 V72 H800 V40";
  const gap = `${cexD} H600 V72 H400 V128 H200 V186 H0 Z`;
  return (
    <svg className="dk-lvr" viewBox="-10 0 830 280" role="img" aria-label="The exchange price moves first; the pool price lags until an arbitrage trade; the gap is the LP's loss">
      <defs>
        <pattern id="dk-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="7" fill="#f4f4f2" opacity=".4" /></pattern>
      </defs>
      <motion.path d={gap} fill="url(#dk-hatch)" variants={fadeV} custom={1.9} />
      <motion.path d={cexD} className="dk-lvr-cex" variants={drawV} custom={0.4} />
      <motion.path d={pool} className="dk-lvr-pool" variants={drawV} custom={0.9} />
      {[[200, 186], [400, 128], [600, 72], [800, 40]].map(([x, y], i) => (
        <motion.circle key={x} cx={x} cy={y} r="7" className="dk-lvr-arb" variants={fadeV} custom={1.2 + i * 0.3} />
      ))}
      <motion.g variants={fadeV} custom={1.4}>
        <text x="800" y="22" className="dk-lvr-label" textAnchor="end">Real price (Binance)</text>
        <text x="410" y="166" className="dk-lvr-label dk-lvr-muted">Uniswap pool price</text>
        <text x="20" y="276" className="dk-lvr-label dk-lvr-muted">● arbitrage trade &nbsp;&nbsp; ▨ LP’s loss</text>
      </motion.g>
    </svg>
  );
}

function Columns({ data, max, format, neg = false, d = 0.3 }: { data: [string, number][]; max: number; format: (v: number) => string; neg?: boolean; d?: number }) {
  return (
    <div className={`dk-cols ${neg ? "dk-cols-neg" : ""}`}>
      {data.map(([label, v], i) => (
        <div key={label} className="dk-col">
          <motion.b variants={fadeV} custom={d + 0.6 + i * 0.07}>{format(v)}</motion.b>
          <span className="dk-col-track">
            <motion.i style={{ height: `${Math.max(1.2, (v / max) * 100)}%` }} variants={growV} custom={d + i * 0.07} />
          </span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ deck */

const TITLES = ["Kancy", "Problem", "Why", "The gap", "Failed fixes", "Insight", "Solution", "Losses first", "Why a hook", "Business model", "Competition", "Why now", "Ask"];

export function Deck({ print = false }: { print?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: root });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });
  const [active, setActive] = useState(1);

  useEffect(() => {
    const el = root.current!;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.slide));
    }, { root: el, threshold: 0.55 });
    el.querySelectorAll("[data-slide]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const go = useCallback((n: number) => {
    root.current?.querySelector(`[data-slide="${Math.min(TITLES.length, Math.max(1, n))}"]`)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(active + 1); }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(active - 1); }
      if (e.key === "Home") { e.preventDefault(); go(1); }
      if (e.key === "End") { e.preventDefault(); go(TITLES.length); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go]);

  return (
    <Print.Provider value={print}>
    <div className={`dk ${print ? "dk-print" : ""}`}>
      <header className="dk-top">
        <Link href="/" className="brand"><Mark /><span><b>kancy</b><small>PROTOCOL</small></span></Link>
        <p className="dk-count"><b>{String(active).padStart(2, "0")}</b> / {TITLES.length} <span>{TITLES[active - 1]}</span></p>
        <Link href="/dashboard" className="btn btn-small">Launch app <span className="arrow" aria-hidden="true">→</span></Link>
        <motion.i className="dk-progress" style={{ scaleX: progress }} aria-hidden="true" />
      </header>
      <nav className="dk-dots" aria-label="Slides">
        {TITLES.map((t, i) => (
          <button key={i} type="button" aria-label={`Slide ${i + 1}: ${t}`} aria-current={active === i + 1 ? "step" : undefined} onClick={() => go(i + 1)} />
        ))}
      </nav>

      <div className="dk-scroll" ref={root}>
        {/* 1 · title */}
        <motion.section className="dk-slide dk-cover" data-slide={1} aria-label="Kancy Protocol" initial={print ? "show" : "hidden"} whileInView="show" viewport={{ amount: 0.45 }}>
          <div className="dk-body dk-cover-body">
            <motion.div className="dk-cover-mark" variants={numV}><Mark /></motion.div>
            <h1 className="dk-title"><Line d={0.15}>Kancy Protocol</Line></h1>
            <p className="dk-tagline"><Line d={0.35}>Managed Uniswap liquidity where the manager loses first.</Line></p>
          </div>
          <motion.footer className="dk-cover-foot" variants={fadeV} custom={0.7}>
            <span>Uniswap Hook Incubator · UHI11</span><span>Active Management &amp; Curation</span><span>Live on Unichain Sepolia</span>
          </motion.footer>
        </motion.section>

        {/* 2 · problem number */}
        <Slide n={2} label="The problem" source="Bitquery, Ethereum Uniswap v3, 12 months">
          <Num>−$<Count to={20.4} digits={1} />M</Num>
          <p className="dk-say"><Line d={0.3}>Uniswap v3 LPs on Ethereum ended a year</Line><Line d={0.4}><b>$20.4M behind</b> just holding their tokens.</Line></p>
        </Slide>

        {/* 3 · why */}
        <Slide n={3} label="Why LPs lose">
          <h2 className="dk-h2"><Line>The pool doesn’t know the real price.</Line><Line d={0.1}><span className="dk-dim">Arbitrageurs do, and LPs pay them.</span></Line></h2>
          <div className="dk-chart"><LvrChart /></div>
        </Slide>

        {/* 4 · the gap: prop amms */}
        <Slide n={4} label="Active management works, but it’s closed" source="Blockworks 0xResearch, Oct 2026">
          <div className="dk-two">
            <div>
              <Num><Count to={50} />%+</Num>
              <p className="dk-say"><Line d={0.3}>of SOL/USDC volume now trades against</Line><Line d={0.4}><b>actively managed</b> prop AMMs.</Line></p>
            </div>
            <Fade d={0.6} className="dk-eco">
              <div><small>Solana</small><p>HumidiFi · Tessera</p></div>
              <div><small>Ethereum · ~14% of DEX volume</small><p>Fermiswap</p></div>
              <div className="dk-eco-lock"><small>Who can deposit</small><p>Only the firm itself.</p></div>
            </Fade>
          </div>
        </Slide>

        {/* 5 · failed fixes */}
        <Slide n={5} label="Delegating LP management has failed" source="DefiLlama, TVL change year over year">
          <h2 className="dk-h2"><Line>Automated LP managers lost</Line><Line d={0.1}><span className="dk-dim">up to 83% of their deposits.</span></Line></h2>
          <Columns neg max={100} format={(v) => `−${v}%`} data={[["ICHI", 83], ["Meteora", 78], ["Kamino", 77], ["Steer", 74], ["Gamma", 73], ["Beefy", 62], ["Arrakis", 44]]} />
        </Slide>

        {/* 6 · insight */}
        <Slide n={6} label="The insight" source="Morpho curated lending $9.43B vs LP managers $183M, DefiLlama">
          <div className="dk-two">
            <div>
              <Num><Count to={51} />×</Num>
              <p className="dk-say"><Line d={0.3}>more capital trusts curators than LP managers.</Line><Line d={0.4}>The money exists. <b>The trust doesn’t.</b></Line></p>
            </div>
            <Columns max={9430} d={0.4} format={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(2)}B` : `$${v}M`)} data={[["Curated lending", 9430], ["LP managers", 183]]} />
          </div>
        </Slide>

        {/* 7 · solution */}
        <Slide n={7} label="The solution">
          <Fade><p className="dk-lead">Kancy is a Uniswap v4 hook that lets anyone manage other people’s liquidity, with three guarantees:</p></Fade>
          <ol className="dk-promises">
            {[
              ["Capital can’t leave the pool.", "The vault owns every position. Managers only move the range."],
              ["Managers lose first.", "Their own stake absorbs every loss before depositors."],
              ["The record can’t be faked.", "Results are written by the contracts at settlement."],
            ].map(([t, b], i) => (
              <li key={t}>
                <motion.span className="dk-promise-n" variants={numV} custom={0.2 + i * 0.25}>{i + 1}</motion.span>
                <div><h3><Line d={0.25 + i * 0.25}>{t}</Line></h3><Fade d={0.4 + i * 0.25}><p>{b}</p></Fade></div>
              </li>
            ))}
          </ol>
        </Slide>

        {/* 8 · waterfall */}
        <Slide n={8} label="Losses first">
          <div className="dk-two">
            <div>
              <Num>$<Count to={0} /></Num>
              <p className="dk-say"><Line d={0.3}>lost by depositors when a Manager</Line><Line d={0.4}>loses <b>$1,800</b> on a $10,000 allocation.</Line></p>
            </div>
            <div className="dk-fall" aria-hidden="true">
              <div className="dk-fall-block dk-fall-stake">
                <motion.i className="dk-fall-burn" variants={growV} custom={0.6} />
                <span>Manager’s stake · $2,000</span>
              </div>
              <div className="dk-fall-block dk-fall-core"><span>Depositors · $10,000 · untouched</span></div>
              <Fade d={1.6} className="dk-fall-tag">◀ the $1,800 loss stops here</Fade>
            </div>
          </div>
        </Slide>

        {/* 9 · why a hook */}
        <Slide n={9} label="Why it needs a hook">
          <h2 className="dk-h2"><Line>Take out the hook,</Line><Line d={0.1}><span className="dk-dim">and every guarantee breaks.</span></Line></h2>
          <div className="dk-grid3">
            {[
              ["beforeAddLiquidity", "Rejects any liquidity not placed by the Kancy vault. Managers can’t route capital elsewhere."],
              ["afterSwap", "Records every swap and fee onchain. That is the scoreboard."],
              ["Oracle settlement", "Values positions at Chainlink, not the pool, so nobody can pump the price before a settlement."],
            ].map(([t, b], i) => (
              <Fade key={t} d={0.3 + i * 0.15} className="dk-cell"><code>{t}</code><p>{b}</p></Fade>
            ))}
          </div>
        </Slide>

        {/* 11 · business model */}
        <Slide n={10} label="Business model · a winning epoch">
          <h2 className="dk-h2"><Line>Managers are paid to beat the pool.</Line><Line d={0.1}><span className="dk-dim">Only on profit, never on deposits.</span></Line></h2>
          <div className="dk-split3">
            {([["Depositors", 80], ["Manager", 18], ["Curator", 2]] as const).map(([l, v], i) => (
              <motion.div key={l} style={{ flexGrow: v }} variants={growXV} custom={0.3 + i * 0.2}>
                <b>{v}%</b><span>{l}</span>
              </motion.div>
            ))}
          </div>
          <Fade d={1}><p className="dk-foot">20% performance fee on positive epochs · curator takes 10% of it by default · 1,000 USDC minimum stake</p></Fade>
        </Slide>

        {/* 12 · competition */}
        <Slide n={11} label="Competition">
          <h2 className="dk-h2"><Line>Every piece exists somewhere.</Line><Line d={0.1}><span className="dk-dim">Nobody has all of them.</span></Line></h2>
          <Fade d={0.3} className="dk-table-wrap">
            <table className="dk-table">
              <thead><tr><th /><th>Anyone can manage</th><th>Manager loses first</th><th>Capital locked</th><th>Honest record</th><th>Curators</th></tr></thead>
              <tbody>
                {([
                  ["LP vaults · Gamma, Steer", [0, 0, 1, 0, 0]],
                  ["Copy-LP · Krystal, Revert", [1, 0, 0, 0, 0]],
                  ["Morpho curators", [0, 0, 0, 1, 1]],
                  ["Prop AMMs", [0, 1, 1, 0, 0]],
                  ["Hyperliquid vaults", [1, 1, 0, 1, 0]],
                  ["Kancy", [1, 1, 1, 1, 1]],
                ] as [string, number[]][]).map(([n, r]) => (
                  <tr key={n} className={n === "Kancy" ? "dk-us" : ""}>
                    <td>{n}</td>
                    {r.map((v, i) => <td key={i}>{v ? "●" : <span className="dk-no">○</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Fade>
        </Slide>

        {/* 13 · why now */}
        <Slide n={12} label="Why now" source="Morpho API, Nov 2026 · Atrium UHI11 brief">
          <div className="dk-two">
            <div>
              <Num><Count to={71} /><em> of </em>147</Num>
              <p className="dk-say"><Line d={0.3}>curated vaults over $1M charge <b>0% fees</b>.</Line><Line d={0.4}>Curators need something new to earn on.</Line></p>
            </div>
            <Fade d={0.6} className="dk-eco">
              <div><small>Uniswap v4</small><p>~$1.05B TVL · 46% of volume</p></div>
              <div><small>Uniswap Labs</small><p>URC-4 Active Liquidity Framework</p></div>
              <div><small>UHI11 theme</small><p>Curated, actively managed liquidity</p></div>
            </Fade>
          </div>
        </Slide>

        {/* 14 · ask */}
        <motion.section className="dk-slide dk-cover" data-slide={13} aria-label="Try it" initial={print ? "show" : "hidden"} whileInView="show" viewport={{ amount: 0.45 }}>
          <div className="dk-body dk-cover-body">
            <motion.div className="dk-cover-mark" variants={numV}><Mark /></motion.div>
            <h2 className="dk-title"><Line d={0.15}>Back a manager.</Line><Line d={0.25}><span className="dk-dim">They lose first.</span></Line></h2>
            <Fade d={0.5} className="dk-actions">
              <Link href="/dashboard" className="btn btn-solid">Launch app <span className="arrow">→</span></Link>
              <Link href="/faucet" className="btn">Get testnet tokens</Link>
            </Fade>
          </div>
          <motion.footer className="dk-cover-foot" variants={fadeV} custom={0.7}>
            <span>Kancy Protocol</span><span>Open-source manager bot</span><span>Testnet · unaudited</span>
          </motion.footer>
        </motion.section>
      </div>
    </div>
    </Print.Provider>
  );
}
