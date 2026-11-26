"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { CountUp } from "@/components/fx";
import { ResultCard } from "@/components/result-card";
import { Panel, PageHead, Split } from "@/components/ui";
import { toUsd, usd } from "@/lib/format";
import { useManagers, useProtocol, useVaults } from "@/lib/hooks";
import { useLatestResults } from "@/lib/indexer";

const ACTIONS = [
  { href: "/vaults", title: "Deposit into a vault", body: "Earn on Uniswap v4 liquidity with a Manager’s stake in front of you." },
  { href: "/manage", title: "Run a strategy", body: "Post a 1,000 mUSDC first-loss stake and steer a price range." },
  { href: "/curate", title: "Curate a vault", body: "Set the rules, pick Managers and size their allocations." },
  { href: "/faucet", title: "Get testnet tokens", body: "Free mUSDC and mWETH, once a day per wallet." },
];

export function Dashboard() {
  const { address } = useAccount();
  const { epoch, price } = useProtocol();
  const { managers } = useManagers();
  const { vaults } = useVaults();
  const latest = useLatestResults(4);
  const staked = managers?.reduce((t, m) => t + toUsd(m.stake) + toUsd(m.pendingStake), 0);
  const deposits = vaults?.reduce((t, v) => t + toUsd(v.nav), 0);
  const results = latest.data?.managerEpochs.items.filter((r) => BigInt(r.capitalStart) > 0n) ?? [];
  const topVaults = [...(vaults ?? [])].sort((a, b) => Number(b.nav - a.nav)).slice(0, 5);

  const stats: [string, number | undefined, number, string?][] = [
    ["First-loss stake posted", staked, 0, "$"],
    ["Held in vaults", deposits, 0, "$"],
    ["Managers", managers?.length, 0],
    ["Vaults", vaults?.length, 0],
    ["Current epoch", epoch === undefined ? undefined : Number(epoch), 0],
    ["ETH oracle price", price === undefined ? undefined : toUsd(price), 2, "$"],
  ];

  return (
    <div className="page">
      <PageHead eyebrow="Overview" title={address ? "Welcome back" : "Dashboard"}
        lead="Protocol health, the latest settlements and everything you can do, in one place." />

      <dl className="stats stats-6">
        {stats.map(([label, value, digits, prefix]) => (
          <div key={label} className="stat">
            <dt>{label}</dt>
            <dd><CountUp value={value} digits={digits} prefix={prefix} /></dd>
          </div>
        ))}
      </dl>

      <section className="quick" aria-label="Quick actions">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="quick-card">
            <b>{a.title}</b>
            <span>{a.body}</span>
            <i className="arrow" aria-hidden="true">→</i>
          </Link>
        ))}
      </section>

      <div className="columns">
        <Panel title="Latest settlements" action={<Link href="/managers" className="text-link">Scoreboard <span className="arrow">→</span></Link>}>
          {results.length === 0 ? (
            <p className="muted">No settled epoch with capital yet. Results appear here after the next settlement.</p>
          ) : (
            <div className="cards cards-2">{results.map((r) => <ResultCard key={`${r.manager}-${r.epoch}`} r={r} />)}</div>
          )}
        </Panel>
        <Panel title="Largest vaults" action={<Link href="/vaults" className="text-link">All vaults <span className="arrow">→</span></Link>}>
          {topVaults.length === 0 ? (
            <p className="muted">No vaults yet. <Link href="/curate">Create the first one.</Link></p>
          ) : (
            <ul className="vault-list">
              {topVaults.map((v) => (
                <li key={v.address}>
                  <Link href={`/vaults/${v.address}`}>
                    <span><b>{v.name || "Unnamed vault"}</b><small>{v.managers.length} managers · min cover {Number(v.minRatioBps) / 100}%</small></span>
                    <em>${usd(v.nav, 0)}</em>
                  </Link>
                  <Split stake={Number(v.idle)} backed={Number(v.allocated)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
