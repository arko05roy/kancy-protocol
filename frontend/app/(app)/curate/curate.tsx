"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { Art } from "@/components/fx";
import { ChainError, Field, Loading, PageHead, Panel, StatusBadge, TxButton } from "@/components/ui";
import { factory, Status, vaultAt } from "@/lib/contracts";
import { parseAmount, usd } from "@/lib/format";
import { useManagers, useVaults, type ManagerRow, type VaultRow } from "@/lib/hooks";
import { useTx } from "@/lib/tx";

type Rules = { cut: string; ratio: string; max: string };

function checkRules({ cut, ratio, max }: Rules) {
  const c = Number(cut), r = Number(ratio), m = parseAmount(max);
  return {
    cutError: cut === "" || !(c >= 0 && c <= 50) ? "0 to 50%." : undefined,
    ratioError: !(r >= 0.01 && r <= 100) ? "0.01 to 100%." : undefined,
    maxError: !m ? "Enter a number above zero." : undefined,
    values: c >= 0 && c <= 50 && cut !== "" && r >= 0.01 && r <= 100 && m
      ? { curatorCutBps: Math.round(c * 100), minRatioBps: Math.round(r * 100), maxAllocation: m }
      : undefined,
  };
}

function RuleFields({ rules, set }: { rules: Rules; set: (r: Rules) => void }) {
  const c = checkRules(rules);
  return (
    <div className="field-row">
      <Field label="Min first-loss ratio" unit="%" value={rules.ratio} onChange={(ratio) => set({ ...rules, ratio })} error={c.ratioError} hint="Stake ÷ allocation." />
      <Field label="Max per manager" unit="mUSDC" value={rules.max} onChange={(max) => set({ ...rules, max })} error={c.maxError} />
      <Field label="Your cut of the fee" unit="%" value={rules.cut} onChange={(cut) => set({ ...rules, cut })} error={c.cutError} hint="Share of the 20% manager fee." />
    </div>
  );
}

const DEFAULTS: Rules = { cut: "10", ratio: "10", max: "50000" };

export function Curate() {
  const { address } = useAccount();
  const { vaults, isError } = useVaults();
  const { managers } = useManagers();
  const { run } = useTx();
  const [name, setName] = useState("");
  const [rules, setRules] = useState(DEFAULTS);
  const check = checkRules(rules);
  const mine = vaults?.filter((v) => v.curator.toLowerCase() === address?.toLowerCase()) ?? [];

  return (
    <div className="page">
      <PageHead title="Curate" eyebrow="Curator tools"
        lead="Create a vault, decide how much first-loss you demand, then approve Managers and size their allocations."
        art={<Art name="orbit" className="head-art" />} />
      {isError && <ChainError />}
      {address && !vaults && !isError && <Loading />}
      {mine.map((v) => <MyVault key={v.address} vault={v} managers={managers ?? []} />)}
      <Panel title={mine.length ? "Create another vault" : "Create a vault"} className="panel-bright">
        <Field label="Vault name" value={name} onChange={(v) => setName(v.slice(0, 32))} inputMode="text" placeholder="e.g. Blue Orbit" hint="Public, set once." />
        <RuleFields rules={rules} set={setRules} />
        <TxButton label="Create vault" disabled={!name.trim() || !check.values}
          onClick={async () => {
            const c = check.values!;
            if (await run("Create vault", { ...factory, functionName: "createVault", args: [name.trim(), "", c.curatorCutBps, c.minRatioBps, c.maxAllocation] })) setName("");
          }} />
      </Panel>
    </div>
  );
}

function MyVault({ vault, managers }: { vault: VaultRow; managers: ManagerRow[] }) {
  const { run } = useTx();
  const v = vaultAt(vault.address);
  const q = useReadContracts({
    contracts: vault.managers.flatMap((m) => [
      { ...v, functionName: "target", args: [m] } as const,
      { ...v, functionName: "removing", args: [m] } as const,
    ]),
    query: { enabled: vault.managers.length > 0, refetchInterval: 20_000 },
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pick, setPick] = useState("");
  const [rules, setRules] = useState<Rules>(DEFAULTS);
  useEffect(() => {
    setRules({ cut: String(Number(vault.curatorCutBps) / 100), ratio: String(Number(vault.minRatioBps) / 100), max: formatUnits(vault.maxAllocation, 6) });
  }, [vault.curatorCutBps, vault.minRatioBps, vault.maxAllocation]);

  const removing = (i: number) => q.data?.[i * 2 + 1]?.result === true;
  const candidates = managers.filter((m) => m.status === Status.Active && (!vault.managers.includes(m.address) || removing(vault.managers.indexOf(m.address))));
  const changed = vault.managers.flatMap((m, i) => {
    const text = drafts[m];
    if (text === undefined || removing(i)) return [];
    const value = text.trim() === "0" ? 0n : parseAmount(text);
    return value === undefined ? [] : [{ m, value }];
  });
  const check = checkRules(rules);

  return (
    <Panel title={vault.name || "Your vault"} action={<Link href={`/vaults/${vault.address}`} className="role-cta">Public page →</Link>}>
      <p className="muted">Value {usd(vault.nav)} · idle {usd(vault.idle)} · with managers {usd(vault.allocated)} mUSDC</p>

      {vault.managers.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Manager</th><th>Status</th><th>Stake</th><th>Current target</th><th>New target (mUSDC)</th><th /></tr></thead>
            <tbody>
              {vault.managers.map((address, i) => {
                const m = managers.find((x) => x.address === address);
                const target = q.data?.[i * 2]?.result as bigint | undefined;
                return (
                  <tr key={address}>
                    <td><Link href={`/managers/${address}`}>{m?.name ?? address.slice(0, 8)}</Link></td>
                    <td>{removing(i) ? "Leaving at settlement" : m && <StatusBadge status={m.status} />}</td>
                    <td>{usd(m?.stake)}</td>
                    <td>{usd(target)}</td>
                    <td><input className="cell-input" inputMode="decimal" aria-label={`New target for ${m?.name ?? address}`} disabled={removing(i)}
                      value={drafts[address] ?? ""} placeholder="unchanged" onChange={(e) => setDrafts({ ...drafts, [address]: e.target.value })} /></td>
                    <td>{!removing(i) && <TxButton small solid={false} label="Remove" onClick={() => run("Remove", { ...v, functionName: "removeManager", args: [address] })} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {vault.managers.length > 0 && (
        <>
          <TxButton label="Save targets" disabled={changed.length === 0}
            onClick={async () => {
              if (await run("Save targets", { ...v, functionName: "setTargets", args: [changed.map((c) => c.m), changed.map((c) => c.value)] })) setDrafts({});
            }} />
          <p className="muted small">Targets apply at the next settlement, capped by your max, each Manager’s stake and the cash available.</p>
        </>
      )}

      <div className="inline-form">
        <label className="field">
          <span>Approve a manager</span>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{candidates.length ? "Choose an Active manager" : "No Active managers to add"}</option>
            {candidates.map((m) => <option key={m.address} value={m.address}>{m.name} · stake {usd(m.stake, 0)}</option>)}
          </select>
        </label>
        <TxButton label="Add manager" disabled={!pick}
          onClick={async () => { if (await run("Add manager", { ...v, functionName: "addManager", args: [pick] })) setPick(""); }} />
      </div>

      <details>
        <summary>Change rules</summary>
        <p className="muted small">Changes take effect after one full epoch, so depositors are warned.</p>
        <RuleFields rules={rules} set={setRules} />
        <TxButton solid={false} label="Queue rule change" disabled={!check.values}
          onClick={() => run("Queue rule change", { ...v, functionName: "queueConfig", args: [check.values!] })} />
      </details>
    </Panel>
  );
}
