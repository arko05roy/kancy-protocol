"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits, type Address as Hex } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { LineChart } from "@/components/chart";
import { PixelText } from "@/components/pixel-text";
import { Address, ChainError, Empty, Field, IndexerNote, Loading, PageHead, Panel, Stat, StatusBadge, TxButton } from "@/components/ui";
import { factory, registry, vaultAt } from "@/lib/contracts";
import { amount as fmtAmount, parseAmount, signed, usd, when } from "@/lib/format";
import { useManagerRows, useProtocol, useUsdc, useVaultRows, type VaultRow } from "@/lib/hooks";
import { useVaultHistory } from "@/lib/indexer";
import { useTx } from "@/lib/tx";

export function VaultDetail({ address }: { address: Hex }) {
  const check = useReadContracts({ contracts: [{ ...factory, functionName: "isVault", args: [address] }] });
  const isVault = check.data?.[0]?.result;
  const list = useMemo(() => (isVault ? [address] : undefined), [isVault, address]);
  const { rows, isError } = useVaultRows(list);
  const vault = rows?.[0];

  if (isVault === false) {
    return (
      <div className="page">
        <Empty title="Not a Kancy vault"><p>This address was not created by the vault factory.</p><Link href="/vaults" className="btn">All vaults →</Link></Empty>
      </div>
    );
  }
  if (isError || check.data?.[0]?.status === "failure") return <div className="page"><ChainError /></div>;
  if (!vault) return <div className="page"><Loading /></div>;
  return <Vault vault={vault} />;
}

function Vault({ vault }: { vault: VaultRow }) {
  const { rows: managers } = useManagerRows(vault.managers);
  const history = useVaultHistory(vault.address);
  const allocations = useReadContracts({
    contracts: vault.managers.flatMap((m) => [
      { ...registry, functionName: "allocation", args: [m, vault.address] } as const,
      { ...vaultAt(vault.address), functionName: "target", args: [m] } as const,
    ]),
    query: { refetchInterval: 20_000, enabled: vault.managers.length > 0 },
  });
  const sharePrice = vault.supply > 0n ? (Number(vault.nav) + 1) / (Number(vault.supply) + 1) : 1;
  const mine = (i: number) => allocations.data?.[i * 2]?.result as bigint | undefined;
  const target = (i: number) => allocations.data?.[i * 2 + 1]?.result as bigint | undefined;

  // stake standing in front of this vault: each Manager's stake, pro rata to our share of their backing
  const shield = (managers ?? []).reduce((t, m, i) => {
    const a = mine(i) ?? 0n;
    return m.allocated > 0n ? t + (m.stake * a) / m.allocated : t;
  }, 0n);
  const cover = vault.allocated > 0n ? (Number(shield) / Number(vault.allocated)) * 100 : 0;

  const epochs = [...(history.data?.vaultEpochs.items ?? [])].reverse();
  const pnlOf = (m: string) => history.data?.allocations.items.find((a) => a.manager === m.toLowerCase())?.cumulativePnl;

  return (
    <div className="page">
      <PageHead title={<PixelText lines={[vault.name || "Vault"]} rows={24} maxCell={3.2} />}
        lead={<>Curated by <Address value={vault.curator} /> · vault <Address value={vault.address} /></>} />
      <dl className="stats">
        <Stat label="Vault value" value={`$${usd(vault.nav)}`} />
        <Stat label="Share price" value={sharePrice.toFixed(6)} />
        <Stat label="With managers" value={`$${usd(vault.allocated)}`} />
        <Stat label="Stake in front of you" value={vault.allocated > 0n ? `${cover.toFixed(1)}%` : "—"} hint={`$${usd(shield)} absorbs losses first`} />
      </dl>

      <div className="columns">
        <div className="stack">
          <Panel title="Share price">
            {history.isError ? <IndexerNote /> : epochs.length === 0 ? (
              <p className="muted">The chart starts after this vault’s first settlement.</p>
            ) : (
              <LineChart caption="Share price by epoch" format={(v) => v.toFixed(6)}
                points={epochs.map((e) => ({ label: `Epoch ${e.epoch} · ${when(e.timestamp)}`, value: e.sharePrice }))} />
            )}
          </Panel>
          <Panel title="Managers">
            {vault.managers.length === 0 ? (
              <p className="muted">The curator has not approved a Manager yet, so deposits stay idle.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Manager</th><th>Status</th><th>Allocation</th><th>Target</th><th>Coverage</th><th>Vault P&amp;L</th></tr></thead>
                  <tbody>
                    {(managers ?? []).map((m, i) => {
                      const pnl = pnlOf(m.address);
                      return (
                        <tr key={m.address}>
                          <td><Link href={`/managers/${m.address}`}>{m.name}</Link></td>
                          <td><StatusBadge status={m.status} /></td>
                          <td>{usd(mine(i))}</td>
                          <td>{usd(target(i))}</td>
                          <td>{m.allocated > 0n ? `${((Number(m.stake) / Number(m.allocated)) * 100).toFixed(1)}%` : "—"}</td>
                          <td>{pnl === undefined ? "—" : signed(Number(pnl) / 1e6)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Rules">
            <dl className="rows">
              <div><dt>Minimum first-loss ratio</dt><dd>{Number(vault.minRatioBps) / 100}%</dd></div>
              <div><dt>Max allocation per manager</dt><dd>{usd(vault.maxAllocation)} mUSDC</dd></div>
              <div><dt>Curator cut of manager fee</dt><dd>{Number(vault.curatorCutBps) / 100}%</dd></div>
              <div><dt>Idle, earning nothing</dt><dd>{usd(vault.idle)} mUSDC</dd></div>
            </dl>
          </Panel>
        </div>
        <Position vault={vault} />
      </div>
    </div>
  );
}

function Position({ vault }: { vault: VaultRow }) {
  const { address: user } = useAccount();
  const { epoch } = useProtocol();
  const { balance } = useUsdc(user, vault.address);
  const { run } = useTx();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [text, setText] = useState("");
  const q = useReadContracts({
    contracts: [
      { ...vaultAt(vault.address), functionName: "balanceOf", args: [user!] },
      { ...vaultAt(vault.address), functionName: "requests", args: [user!] },
      { ...vaultAt(vault.address), functionName: "claimable", args: [user!] },
    ],
    query: { enabled: !!user, refetchInterval: 20_000 },
  });
  const shares = q.data?.[0]?.result as bigint | undefined;
  const request = q.data?.[1]?.result as readonly [bigint, bigint] | undefined;
  const claimable = q.data?.[2]?.result as bigint | undefined;
  const queued = request && request[1] > 0n && epoch !== undefined && request[0] >= epoch ? request[1] : 0n;
  const worth = (s: bigint) => (s * (vault.nav + 1n)) / (vault.supply + 1n);

  const value = parseAmount(text);
  const limit = tab === "deposit" ? balance : shares;
  const tooMuch = value !== undefined && limit !== undefined && value > limit;
  const error = text && value === undefined ? "Enter a number above zero." : tooMuch ? "More than you hold." : undefined;
  const v = vaultAt(vault.address);

  const submit = async () => {
    if (!value) return;
    const ok = tab === "deposit"
      ? await run("Deposit", { ...v, functionName: "deposit", args: [value] }, { approve: { spender: vault.address, amount: value } })
      : await run("Request withdrawal", { ...v, functionName: "requestWithdraw", args: [value] });
    if (ok) setText("");
  };

  return (
    <aside className="stack sticky">
      <Panel title="Your position" className="panel-bright">
        <p className="vault-nav">${usd(shares === undefined ? (user ? undefined : 0n) : worth(shares + queued))}</p>
        <p className="muted small">{fmtAmount(shares ?? 0n, 6, 2)} shares{queued > 0n && ` · ${fmtAmount(queued, 6, 2)} queued to exit`}</p>

        <div className="tabs" role="tablist">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setText(""); }}>
              {t === "deposit" ? "Deposit" : "Withdraw"}
            </button>
          ))}
        </div>
        <Field label={tab === "deposit" ? "Amount to deposit" : "Shares to withdraw"} unit={tab === "deposit" ? "mUSDC" : "shares"}
          value={text} onChange={setText} error={error}
          max={limit ? () => setText(formatUnits(limit, 6)) : undefined}
          hint={tab === "deposit"
            ? `Wallet: ${usd(balance)} mUSDC. Starts working at the next settlement.`
            : value ? `About ${usd(worth(value))} mUSDC at the last settled price. Paid after settlement.` : "Queued shares still carry this epoch’s result."} />
        <TxButton label={tab === "deposit" ? "Deposit" : "Request withdrawal"} onClick={submit} disabled={!value || tooMuch} />
        {tab === "deposit" && user && balance === 0n && <p className="note">You have no mUSDC. <Link href="/faucet">Get some from the faucet.</Link></p>}
      </Panel>

      {(queued > 0n || (claimable ?? 0n) > 0n) && (
        <Panel title="Withdrawals">
          {queued > 0n && (
            <>
              <p>{fmtAmount(queued, 6, 2)} shares settle at the end of epoch {String(request![0])}.</p>
              <TxButton small solid={false} label="Cancel request" onClick={() => run("Cancel request", { ...v, functionName: "cancelWithdraw" })} />
            </>
          )}
          {(claimable ?? 0n) > 0n && (
            <>
              <p><b>{usd(claimable)} mUSDC</b> is ready.</p>
              <TxButton label="Claim" onClick={() => run("Claim", { ...v, functionName: "claim" })} />
            </>
          )}
        </Panel>
      )}
    </aside>
  );
}
