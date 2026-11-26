"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Art } from "@/components/fx";
import { Address, ChainError, Empty, IndexerNote, Loading, PageHead, Split, StatusBadge } from "@/components/ui";
import { pct, usd } from "@/lib/format";
import { useManagers } from "@/lib/hooks";
import { useScoreboard } from "@/lib/indexer";

type Key = "stake" | "allocated" | "return" | "drawdown" | "absorbed" | "passed" | "epochs";
const COLUMNS: [Key, string][] = [
  ["return", "Return"], ["stake", "Stake"], ["allocated", "Backed"], ["absorbed", "Losses absorbed"],
  ["passed", "Passed to backers"], ["drawdown", "Max drawdown"], ["epochs", "Epochs"],
];

export function Scoreboard() {
  const router = useRouter();
  const { managers, isError } = useManagers();
  const score = useScoreboard();
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "return", dir: -1 });

  const rows = managers?.map((m) => {
    const h = score.data?.managers.items.find((x) => x.address === m.address.toLowerCase());
    return {
      ...m,
      values: {
        stake: Number(m.stake + m.pendingStake) / 1e6,
        allocated: Number(m.allocated) / 1e6,
        return: h?.epochsSettled ? h.cumulativeReturn : undefined,
        drawdown: h?.epochsSettled ? h.maxDrawdown : undefined,
        absorbed: h ? Number(h.lossesAbsorbed) / 1e6 : undefined,
        passed: h ? Number(h.lossesPassed) / 1e6 : undefined,
        epochs: h?.epochsSettled,
      } as Record<Key, number | undefined>,
    };
  }).sort((a, b) => ((a.values[sort.key] ?? -Infinity) - (b.values[sort.key] ?? -Infinity)) * sort.dir);

  const show = (k: Key, v: number | undefined) =>
    v === undefined ? "—" : k === "return" ? pct(v) : k === "drawdown" ? `${(v * 100).toFixed(2)}%` : k === "epochs" ? v : usd(v);

  return (
    <div className="page">
      <PageHead title="Scoreboard" eyebrow="Managers"
        lead="Every number here was written by the contracts at settlement. Managers cannot report or edit their own results."
        art={<Art name="torii" className="head-art" />} />
      {score.isError && <IndexerNote />}
      {isError ? <ChainError /> : !rows ? <Loading /> : rows.length === 0 ? (
        <Empty title="No managers yet"><p>Register with a first-loss stake to appear here.</p><Link href="/manage" className="btn btn-solid">Register →</Link></Empty>
      ) : (
        <div className="panel table-wrap">
          <table className="board">
            <thead>
              <tr>
                <th>Manager</th><th>Status</th>
                {COLUMNS.map(([k, label]) => (
                  <th key={k} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => setSort({ key: k, dir: sort.key === k ? (-sort.dir as 1 | -1) : -1 })}>
                      {label}<i aria-hidden="true">{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "·"}</i>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <motion.tr key={m.address} layout="position" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }} onClick={() => router.push(`/managers/${m.address}`)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Link href={`/managers/${m.address}`}>{m.name}</Link>
                    <Address value={m.address} />
                    <Split stake={Number(m.stake + m.pendingStake)} backed={Number(m.allocated)} />
                  </td>
                  <td><StatusBadge status={m.status} /></td>
                  {COLUMNS.map(([k]) => (
                    <td key={k}>
                      {show(k, m.values[k])}
                      {k === "stake" && m.pendingStake > 0n && <small className="muted cell-note">{m.stake === 0n ? "deploys at settlement" : `${usd(m.pendingStake)} pending`}</small>}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
