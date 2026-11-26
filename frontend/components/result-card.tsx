import Link from "next/link";
import { short, signed, usd, when, pct } from "@/lib/format";
import type { IManagerEpoch } from "@/lib/indexer";
import { managerName } from "@/lib/names";
import { Star } from "./ui";

/** PRD §15 key moment: "Manager lost X, stake absorbed 100%, your loss: 0". */
export function ResultCard({ r, link = true }: { r: IManagerEpoch; link?: boolean }) {
  const pnl = BigInt(r.pnl);
  const fromStake = BigInt(r.fromStake);
  const fromBackers = BigInt(r.fromBackers);
  const lost = pnl < 0n;
  const covered = lost && -pnl > 0n ? Number((fromStake * 1000n) / -pnl) / 10 : 100;
  const body = (
    <article className={`epoch-card ${lost ? "lost" : ""}`}>
      <header><span><Star size={10} />Epoch {r.epoch}</span><time>{when(r.timestamp)}</time></header>
      <h3>{link ? managerName(r.manager) : short(r.manager)}</h3>
      <p className="epoch-pnl">{lost ? "▼" : "▲"} {signed(Number(pnl) / 1e6)} <small>{pct(r.returnPct)}</small></p>
      {lost ? (
        <dl>
          <div><dt>Stake absorbed</dt><dd>{covered.toFixed(0)}%</dd></div>
          <div><dt>Passed to depositors</dt><dd>{usd(fromBackers)}</dd></div>
        </dl>
      ) : (
        <dl>
          <div><dt>Capital</dt><dd>{usd(BigInt(r.capitalStart))}</dd></div>
          <div><dt>Stake after</dt><dd>{usd(BigInt(r.stakeAfter))}</dd></div>
        </dl>
      )}
    </article>
  );
  return link ? <Link href={`/managers/${r.manager}`} className="card-link">{body}</Link> : body;
}
