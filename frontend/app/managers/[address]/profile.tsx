"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Address as Hex } from "viem";
import { LineChart, RangeBar } from "@/components/chart";
import { Reveal, Tilt } from "@/components/fx";
import { PixelText } from "@/components/pixel-text";
import { ResultCard } from "@/components/result-card";
import { Address, ChainError, Empty, IndexerNote, Loading, PageHead, Panel, Split, Stat, StatusBadge } from "@/components/ui";
import { EXPLORER, Status, STATUS } from "@/lib/contracts";
import { pct, short, signed, toUsd, usd, when } from "@/lib/format";
import { useManagerRows, useProtocol } from "@/lib/hooks";
import { useManagerHistory } from "@/lib/indexer";
import { tickToUsd } from "@/lib/math";

export function ManagerProfile({ address }: { address: Hex }) {
  const list = useMemo(() => [address], [address]);
  const { rows, isError } = useManagerRows(list);
  const { price, epoch, maxRebalances } = useProtocol();
  const history = useManagerHistory(address);
  const m = rows?.[0];

  if (isError) return <div className="page"><ChainError /></div>;
  if (!m) return <div className="page"><Loading /></div>;
  if (m.status === Status.None) {
    return (
      <div className="page">
        <Empty title="Not a registered manager"><p>{short(address)} has not posted a stake.</p><Link href="/managers" className="btn">Scoreboard →</Link></Empty>
      </div>
    );
  }

  const h = history.data?.managers.items[0];
  const results = history.data?.managerEpochs.items.filter((r) => BigInt(r.capitalStart) > 0n) ?? [];
  const chrono = [...results].reverse();
  const used = epoch !== undefined && m.rebalanceEpoch === epoch ? m.rebalanceCount : 0;

  return (
    <div className="page">
      <PageHead title={<PixelText lines={[m.name]} rows={22} maxCell={3.4} />}
        lead={<>Manager <Address value={address} /></>}>
        <StatusBadge status={m.status} />
      </PageHead>

      <dl className="stats">
        <Stat label="First-loss stake" value={`$${usd(m.stake || m.pendingStake)}`}
          hint={m.pendingStake === 0n ? undefined : m.stake === 0n ? "Posted. Deploys at the next settlement" : `+${usd(m.pendingStake)} joins at the next settlement`} />
        <Stat label="Backed by vaults" value={`$${usd(m.allocated)}`} hint={m.allocated > 0n ? `${((toUsd(m.stake) / toUsd(m.allocated)) * 100).toFixed(1)}% coverage` : "Nothing allocated"} />
        <Stat label="Cumulative return" value={h?.epochsSettled ? pct(h.cumulativeReturn) : "—"} hint={h?.epochsSettled ? `Max drawdown ${(h.maxDrawdown * 100).toFixed(2)}%` : undefined} />
        <Stat label="Losses absorbed" value={h ? `$${usd(BigInt(h.lossesAbsorbed))}` : "—"} hint={h ? `$${usd(BigInt(h.lossesPassed))} passed to backers` : undefined} />
      </dl>

      <div className="columns columns-even">
        <Panel title="Current range">
          {price === undefined ? <Loading /> : <RangeBar low={tickToUsd(m.tickLower)} high={tickToUsd(m.tickUpper)} price={toUsd(price)} />}
          <p className="muted small">{used} of {maxRebalances ?? "—"} rebalances used this epoch{h ? ` · ${h.rebalances} in total` : ""}</p>
        </Panel>
        <Panel title="Capital">
          <Split stake={Number(m.stake)} backed={Number(m.allocated)} />
          <dl className="rows">
            <div><dt>Manager’s own (loses first)</dt><dd>{usd(m.stake)}</dd></div>
            <div><dt>Depositors’ (loses last)</dt><dd>{usd(m.allocated)}</dd></div>
          </dl>
        </Panel>
      </div>

      {history.isError ? <IndexerNote /> : history.isLoading ? <Loading label="Reading history" /> : results.length === 0 ? (
        <Panel title="Results"><p className="muted">No settled epoch with capital yet. The first result appears after the next settlement.</p></Panel>
      ) : (
        <>
          <Panel title="Performance">
            <LineChart zero caption="Cumulative return" format={(v) => pct(v)}
              points={chrono.map((r) => ({ label: `Epoch ${r.epoch} · ${when(r.timestamp)}`, value: r.cumulativeReturn }))} />
          </Panel>
          <div className="cards cards-4">
            {results.slice(0, 4).map((r, i) => (
              <Reveal key={r.epoch} delay={i * 0.07}><Tilt><ResultCard r={r} link={false} /></Tilt></Reveal>
            ))}
          </div>
          <Panel title="Every epoch">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Epoch</th><th>Capital</th><th>P&amp;L</th><th>Return</th><th>From stake</th><th>From backers</th><th>Stake after</th></tr></thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.epoch}>
                      <td>{r.epoch}</td><td>{usd(BigInt(r.capitalStart))}</td><td>{signed(Number(r.pnl) / 1e6)}</td><td>{pct(r.returnPct)}</td>
                      <td>{usd(BigInt(r.fromStake))}</td><td>{usd(BigInt(r.fromBackers))}</td><td>{usd(BigInt(r.stakeAfter))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {history.data && (
        <div className="columns columns-even">
          <Panel title="Status history">
            <ul className="log">
              {history.data.statusChanges.items.map((s) => (
                <li key={s.id}><StatusBadge status={s.status} /><a href={`${EXPLORER}/tx/${s.txHash}`} target="_blank" rel="noreferrer">{when(s.timestamp)} ↗</a></li>
              ))}
              {history.data.statusChanges.items.length === 0 && <li className="muted">Currently {STATUS[m.status]}.</li>}
            </ul>
          </Panel>
          <Panel title="Recent rebalances">
            <ul className="log">
              {history.data.rebalances.items.map((r) => (
                <li key={r.id}>
                  <span>${tickToUsd(r.tickLower).toFixed(0)}–${tickToUsd(r.tickUpper).toFixed(0)}</span>
                  <small>{r.gasUsed ? `${Number(r.gasUsed).toLocaleString()} gas` : ""}</small>
                  <a href={`${EXPLORER}/tx/${r.txHash}`} target="_blank" rel="noreferrer">{when(r.timestamp)} ↗</a>
                </li>
              ))}
              {history.data.rebalances.items.length === 0 && <li className="muted">No rebalances yet.</li>}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
