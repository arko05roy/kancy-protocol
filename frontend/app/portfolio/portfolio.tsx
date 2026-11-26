"use client";

import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { Art, Reveal, Tilt } from "@/components/fx";
import { PixelText } from "@/components/pixel-text";
import { ButtonLink, ChainError, Empty, IndexerNote, Loading, PageHead, Stat, TxButton } from "@/components/ui";
import { ConnectPrompt } from "@/components/wallet";
import { vaultAt } from "@/lib/contracts";
import { signed, usd } from "@/lib/format";
import { useProtocol, useVaults } from "@/lib/hooks";
import { useLatestResults, usePortfolioHistory } from "@/lib/indexer";
import { useTx } from "@/lib/tx";

export function Portfolio() {
  const { address } = useAccount();
  const { vaults, isError } = useVaults();
  const { epoch } = useProtocol();
  const { run } = useTx();
  const history = usePortfolioHistory(address);
  const latest = useLatestResults(200);
  const q = useReadContracts({
    allowFailure: false,
    contracts: (vaults ?? []).flatMap((v) => [
      { ...vaultAt(v.address), functionName: "balanceOf", args: [address!] } as const,
      { ...vaultAt(v.address), functionName: "requests", args: [address!] } as const,
      { ...vaultAt(v.address), functionName: "claimable", args: [address!] } as const,
    ]),
    query: { enabled: !!address && !!vaults?.length, refetchInterval: 20_000 },
  });

  const data = q.data as unknown[] | undefined;
  const positions = (vaults ?? []).flatMap((vault, i) => {
    if (!data) return [];
    const shares = data[i * 3] as bigint;
    const request = data[i * 3 + 1] as readonly [bigint, bigint];
    const claimable = data[i * 3 + 2] as bigint;
    const queued = epoch !== undefined && request[0] >= epoch ? request[1] : 0n;
    const value = ((shares + queued) * (vault.nav + 1n)) / (vault.supply + 1n);
    const key = vault.address.toLowerCase();
    const sum = (rows: { vault: string; assets: string }[]) => rows.filter((r) => r.vault === key).reduce((t, r) => t + BigInt(r.assets), 0n);
    const deposited = history.data ? sum(history.data.deposits.items) : undefined;
    const claimed = history.data ? sum(history.data.withdrawals.items.filter((w) => w.kind === "claimed")) : undefined;
    const earned = deposited === undefined ? undefined : value + claimable + claimed! - deposited;
    if (shares + queued === 0n && claimable === 0n && !deposited) return [];
    return [{ vault, value, claimable, queued, deposited, earned }];
  });
  const total = positions.reduce((t, p) => t + p.value + p.claimable, 0n);
  const earned = history.data ? positions.reduce((t, p) => t + (p.earned ?? 0n), 0n) : undefined;
  // losses Manager stakes have absorbed, across every Manager (recent settlements)
  const absorbed = latest.data?.managerEpochs.items.reduce((t, r) => t + BigInt(r.fromStake), 0n);

  return (
    <div className="page">
      <PageHead title={<PixelText lines={["Portfolio"]} />}
        lead="What you hold, what it has made, and how much Manager stake has taken losses so deposits did not have to."
        art={<Art name="planet" className="head-art" />} />
      {!address ? (
        <Empty title="Connect to see your deposits">
          <ConnectPrompt />
        </Empty>
      ) : isError ? <ChainError /> : !vaults || (vaults.length > 0 && !data) ? <Loading /> : positions.length === 0 ? (
        <Empty title="No deposits yet" art="column">
          <p>Deposit mUSDC into a vault and it shows up here.</p>
          <ButtonLink href="/vaults" solid>Browse vaults</ButtonLink>
        </Empty>
      ) : (
        <>
          {history.isError && <IndexerNote />}
          <dl className="stats">
            <Stat label="Total value" value={`$${usd(total)}`} />
            <Stat label="Your result so far" value={earned === undefined ? "—" : signed(Number(earned) / 1e6)} />
            <Stat label="Absorbed by stakes" value={absorbed === undefined ? "—" : `$${usd(absorbed)}`} hint="All managers, last 200 results" />
          </dl>
          <div className="cards cards-3">
            {positions.map((p, i) => (
              <Reveal key={p.vault.address} delay={i * 0.06}>
                <Tilt>
                  <div className="vault-card">
                    <header><h2><Link href={`/vaults/${p.vault.address}`}>{p.vault.name || "Unnamed vault"}</Link></h2></header>
                    <p className="vault-nav">${usd(p.value)}</p>
                    <dl>
                      <div><dt>Deposited</dt><dd>{usd(p.deposited)}</dd></div>
                      <div><dt>Result</dt><dd>{p.earned === undefined ? "—" : signed(Number(p.earned) / 1e6)}</dd></div>
                      <div><dt>Queued shares</dt><dd>{usd(p.queued)}</dd></div>
                      <div><dt>Claimable</dt><dd>{usd(p.claimable)}</dd></div>
                    </dl>
                    {p.claimable > 0n
                      ? <TxButton label="Claim" onClick={() => run("Claim", { ...vaultAt(p.vault.address), functionName: "claim" })} />
                      : <Link href={`/vaults/${p.vault.address}`} className="role-cta">Deposit or withdraw <span className="arrow">→</span></Link>}
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
