"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Art, CountUp, Reveal, Tilt } from "@/components/fx";
import { LossLab } from "@/components/loss-lab";
import { PixelText } from "@/components/pixel-text";
import { ResultCard } from "@/components/result-card";
import { ButtonLink, SectionHead } from "@/components/ui";
import { toUsd } from "@/lib/format";
import { useManagers, useProtocol, useVaults } from "@/lib/hooks";
import { useLatestResults } from "@/lib/indexer";

const OrbitScene = dynamic(() => import("@/components/orbit-scene"), { ssr: false });

const ROLES = [
  { href: "/vaults", art: "column", who: "Depositor", does: "Put mUSDC in a vault", body: "A Manager’s stake takes every loss before your deposit does. Exit through the queue at the end of any epoch.", cta: "Browse vaults" },
  { href: "/manage", art: "torii", who: "Manager", does: "Post a stake, move a range", body: "Anyone can join with 1,000 mUSDC. Trade your range, keep your own returns and earn 20% of what you make for backers.", cta: "Open the console" },
  { href: "/curate", art: "galaxy", who: "Curator", does: "Choose who gets capital", body: "Create a vault, set the minimum first-loss ratio, pick Managers and size each allocation.", cta: "Create a vault" },
];

const EPOCH = [
  ["Deposit", "USDC waits idle in the vault, so nobody can buy into an epoch whose result is already known."],
  ["Trade", "Managers rebalance their range, at most 12 times per epoch. The vault owns the position the whole time."],
  ["Value", "Anyone can settle. Every position is valued at the Chainlink price, not the pool price."],
  ["Absorb", "Losses come out of the Manager’s stake first. Only what the stake cannot cover reaches depositors."],
  ["Reallocate", "Withdrawals are paid, targets are applied and positions reopen for the next epoch."],
];

const COMMANDS = "cd bots && pnpm install\nMANAGER_KEY=0x… MANAGER_STRATEGY=centered pnpm manager";

function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <Link href="/managers" className="hero-pill"><i className="dot" aria-hidden="true" />Live on Unichain Sepolia<span className="hero-pill-sep" />See the scoreboard <span className="arrow">→</span></Link>
        <h1 className="hero-title">
          <span className="hero-title-sans">Managed liquidity,</span>
          <PixelText as="span" lines={["first-loss cover"]} rows={20} maxCell={4.2} className="hero-title-pixel" />
        </h1>
        <Reveal delay={0.35}>
          <p className="lead hero-lead">
            Deposit USDC into vaults that provide Uniswap v4 liquidity through independent strategy Managers.
            Every Manager puts up their own capital as <b>first-loss cover</b>: if a strategy loses money, their stake pays before a cent of your deposit does.
          </p>
          <div className="actions">
            <ButtonLink href="/dashboard" solid>Launch app</ButtonLink>
            <ButtonLink href="/#cover">See how cover works</ButtonLink>
          </div>
          <ul className="hero-proof">
            {["Manager stake absorbs losses first", "Valued at the Chainlink price", "Vault owns every position"].map((t) => (
              <li key={t}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>{t}</li>
            ))}
          </ul>
        </Reveal>
      </div>
      <div className="hero-orbit">
        <OrbitScene label="A pixel galaxy inside two rings: depositor capital protected by the Manager stake" />
      </div>
      <Art name="mountains" className="hero-mountains" depth={30} />
      <Art name="acropolis" className="hero-temple" depth={16} />
    </section>
  );
}

function LiveStats() {
  const { epoch, price } = useProtocol();
  const { managers } = useManagers();
  const { vaults } = useVaults();
  const staked = managers?.reduce((t, m) => t + toUsd(m.stake) + toUsd(m.pendingStake), 0);
  const deposits = vaults?.reduce((t, v) => t + toUsd(v.nav), 0);
  const items: [string, number | undefined, number, string?][] = [
    ["First-loss stake posted", staked, 0, "$"],
    ["Held in vaults", deposits, 0, "$"],
    ["Managers", managers?.length, 0],
    ["Vaults", vaults?.length, 0],
    ["Current epoch", epoch === undefined ? undefined : Number(epoch), 0],
    ["ETH oracle price", price === undefined ? undefined : toUsd(price), 2, "$"],
  ];
  return (
    <section className="live" aria-label="Live protocol numbers">
      <dl>
        {items.map(([label, value, digits, prefix]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><CountUp value={value} digits={digits} prefix={prefix} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Latest() {
  const { data } = useLatestResults(4);
  const rows = data?.managerEpochs.items.filter((r) => BigInt(r.capitalStart) > 0n) ?? [];
  if (!rows.length) return null;
  return (
    <section className="section">
      <Reveal>
        <div className="section-head-row">
          <SectionHead eyebrow="Track record" title="Latest settlements" lead="Written by the contracts at the end of each epoch. Nobody can edit them." />
          <Link href="/managers" className="text-link">Full scoreboard <span className="arrow">→</span></Link>
        </div>
      </Reveal>
      <div className="cards cards-4">
        {rows.map((r, i) => (
          <Reveal key={`${r.manager}-${r.epoch}`} delay={i * 0.08}>
            <Tilt><ResultCard r={r} /></Tilt>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Terminal() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="terminal panel">
      <div className="terminal-bar"><i /><i /><i /></div>
      <pre>
        {COMMANDS.split("\n").map((line) => <code key={line}><span>&gt;</span> {line}{"\n"}</code>)}
        <code className="comment"># registers, rebalances each epoch, respects the limit<span className="caret" /></code>
      </pre>
      <button type="button" className="btn btn-small" onClick={() => {
        navigator.clipboard?.writeText(COMMANDS);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>{copied ? "Copied" : "Copy commands"}</button>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <LiveStats />

      <section className="section" id="cover">
        <Reveal>
          <SectionHead eyebrow="How the cover works" title="Try to lose the depositor’s money" lead="Drag the loss. The contracts apply this exact waterfall at every settlement." />
        </Reveal>
        <LossLab />
      </section>

      <Latest />

      <section className="section" id="roles">
        <Reveal><SectionHead eyebrow="Three roles" title="Pick your seat" lead="Deposit, manage or curate. Each role has its own console, and all three settle on the same schedule." /></Reveal>
        <div className="cards cards-3">
          {ROLES.map((r, i) => (
            <Reveal key={r.who} delay={i * 0.1}>
              <Tilt className="role">
                <div className="role-art"><img src={`/art/${r.art}.png`} alt="" /></div>
                <p className="role-who">{r.who}</p>
                <h3>{r.does}</h3>
                <p>{r.body}</p>
                <Link href={r.href} className="role-cta">{r.cta} <span className="arrow">→</span></Link>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section" id="epoch">
        <Reveal>
          <SectionHead eyebrow="Lifecycle" title="One epoch, start to finish" lead="One hour on testnet. Everything that changes money happens at the boundary." />
        </Reveal>
        <ol className="timeline">
          {EPOCH.map(([title, body], i) => (
            <li key={title}>
              <Reveal delay={i * 0.1}>
                <span className="node">{String(i + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="section split-section" id="builders">
        <Reveal>
          <SectionHead eyebrow="For builders" title="The Manager bot is open source" lead="Run the centered range strategy with your own key, or fork it and write a better one." />
          <Terminal />
        </Reveal>
        <Art name="globe" className="split-art" depth={26} />
      </section>

      <section className="closing">
        <div className="closing-card">
        <Art name="clouds" className="closing-cloud closing-left" depth={34} />
        <Art name="clouds" className="closing-cloud closing-right" depth={18} />
        <Reveal>
          <p className="eyebrow">Get started</p>
          <h2 className="hero-title closing-title">
            <span className="hero-title-sans">Fund a vault.</span>
            <PixelText as="span" lines={["the manager pays first"]} rows={18} maxCell={3.2} className="hero-title-pixel" />
          </h2>
          <p className="lead">Grab free testnet tokens, pick a vault and watch your first settlement land within the hour.</p>
          <div className="actions">
            <ButtonLink href="/dashboard" solid>Launch app</ButtonLink>
            <ButtonLink href="/faucet">Get testnet tokens</ButtonLink>
          </div>
        </Reveal>
        </div>
      </section>
    </>
  );
}
