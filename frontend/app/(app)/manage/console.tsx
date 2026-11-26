"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { RangeBar } from "@/components/chart";
import { Art } from "@/components/fx";
import { ChainError, Empty, Field, Loading, PageHead, Panel, Stat, StatusBadge, TxButton } from "@/components/ui";
import { ConnectPrompt } from "@/components/wallet";
import { book, registry, settler, Status, TICK_SPACING } from "@/lib/contracts";
import { amount, parseAmount, toUsd, usd } from "@/lib/format";
import { useManagerRows, useProtocol, useUsdc, type ManagerRow } from "@/lib/hooks";
import { planSwap, rangeFromPrices, tickToUsd, type Book } from "@/lib/math";
import { useTx } from "@/lib/tx";

export function Console() {
  const { address } = useAccount();
  const list = useMemo(() => (address ? [address] : undefined), [address]);
  const { rows, isError } = useManagerRows(list);
  const m = rows?.[0];
  const canRegister = m && (m.status === Status.None || (m.status === Status.Paused && m.stake === 0n));

  return (
    <div className="page">
      <PageHead title="Manage" eyebrow="Manager console"
        lead="Post a first-loss stake, choose a price range and move it. The vault owns the position; you only steer it."
        art={<Art name="torii" className="head-art" />} />
      {!address ? (
        <Empty title="Connect your manager wallet">
          <p>The console shows the stake, range and status of the connected address.</p>
          <ConnectPrompt />
        </Empty>
      ) : isError ? <ChainError /> : !m ? <Loading /> : canRegister ? <Register address={address} /> : <Desk m={m} />}
    </div>
  );
}

/** Range expressed as ± percent around the oracle price. */
function useRange(price: bigint | undefined) {
  const [width, setWidth] = useState("2");
  const w = Number(width);
  const mid = toUsd(price);
  const valid = price !== undefined && w >= 0.1 && w <= 50;
  const ticks = valid ? rangeFromPrices(mid * (1 - w / 100), mid * (1 + w / 100), TICK_SPACING) : undefined;
  return { width, setWidth, ticks, mid, error: width && !(w >= 0.1 && w <= 50) ? "Use a width between 0.1 and 50." : undefined };
}

function Register({ address }: { address: `0x${string}` }) {
  const { price, minStake } = useProtocol();
  const { balance } = useUsdc(address, registry.address);
  const { run } = useTx();
  const [name, setName] = useState("");
  const [stake, setStake] = useState("1000");
  const range = useRange(price);
  const value = parseAmount(stake);
  const low = value !== undefined && minStake !== undefined && value < minStake;
  const short = value !== undefined && balance !== undefined && value > balance;

  return (
    <div className="columns">
      <Panel title="Register as a manager" className="panel-bright">
        <Field label="Display name" value={name} onChange={(v) => setName(v.slice(0, 32))} inputMode="text" placeholder="e.g. tight-range-01"
          hint="Public, up to 32 characters. Optional." />
        <Field label="First-loss stake" unit="mUSDC" value={stake} onChange={setStake}
          error={low ? `Minimum is ${usd(minStake)} mUSDC.` : short ? "More than your wallet holds." : undefined}
          hint={`Wallet: ${usd(balance)} mUSDC`} max={balance ? () => setStake(formatUnits(balance, 6)) : undefined} />
        <Field label="Starting range, ± percent around the oracle" unit="%" value={range.width} onChange={range.setWidth} error={range.error}
          hint="You can move it as soon as your stake is deployed." />
        {range.ticks && <RangeBar low={tickToUsd(range.ticks[0])} high={tickToUsd(range.ticks[1])} price={range.mid} />}
        <TxButton label="Register" disabled={!value || low || short || !range.ticks}
          onClick={() => run("Register", { ...registry, functionName: "register", args: [name.trim(), value!, range.ticks![0], range.ticks![1]] },
            { approve: { spender: registry.address, amount: value! } })} />
        {balance !== undefined && minStake !== undefined && balance < minStake && <p className="note">You need mUSDC first. <Link href="/faucet">Open the faucet.</Link></p>}
      </Panel>
      <Panel title="What happens next">
        <ol className="steps">
          <li><b>Next settlement.</b> Your stake moves into the pool and the position opens.</li>
          <li><b>One self-only epoch.</b> You trade only your own money. Rebalance after settlement so the USDC goes to work.</li>
          <li><b>Active.</b> Curators can now add you to their vaults.</li>
        </ol>
        <p className="muted small">If you lose, your stake is spent first. Below the required stake you get one epoch of Grace to top up, then you are Paused.</p>
      </Panel>
    </div>
  );
}

function Desk({ m }: { m: ManagerRow }) {
  const { epoch, price, sqrtPrice, maxRebalances } = useProtocol();
  const { balance } = useUsdc(m.address, registry.address);
  const { run } = useTx();
  const q = useReadContracts({
    contracts: [
      { ...book, functionName: "books", args: [m.address] },
      { ...settler, functionName: "requiredStake", args: [m.address] },
    ],
    query: { refetchInterval: 15_000 },
  });
  const raw = q.data?.[0]?.result as readonly [bigint, number, number, bigint, bigint] | undefined;
  const required = q.data?.[1]?.result as bigint | undefined;
  const b: Book | undefined = raw && { liquidity: raw[0], tickLower: raw[1], tickUpper: raw[2], weth: raw[3], usdc: raw[4] };
  const range = useRange(price);
  const [top, setTop] = useState("");
  const [out, setOut] = useState("");
  const used = epoch !== undefined && m.rebalanceEpoch === epoch ? m.rebalanceCount : 0;
  const deployed = !!b && (b.liquidity > 0n || b.weth > 0n || b.usdc > 0n);
  const plan = deployed && range.ticks && sqrtPrice ? planSwap(b, sqrtPrice, range.ticks[0], range.ticks[1]) : undefined;
  const topV = parseAmount(top);
  const outV = parseAmount(out);
  const surplus = required !== undefined && m.stake > required ? m.stake - required : 0n;
  const paused = m.status === Status.Paused;
  const limit = maxRebalances !== undefined && used >= maxRebalances;

  return (
    <>
      {m.status === Status.Grace && (
        <div className="alert" role="alert">
          <b>Grace period.</b> Your stake is below the required {usd(required)} mUSDC. Top up before the next settlement or you will be Paused.
        </div>
      )}
      {paused && <div className="alert" role="alert"><b>Paused.</b> Capital is returned to vaults. Once your stake is paid back you can register again.</div>}
      <dl className="stats">
        <Stat label="Status" value={<StatusBadge status={m.status} />} />
        <Stat label="Stake" value={`$${usd(m.stake || m.pendingStake)}`}
          hint={m.pendingStake === 0n ? `Required ${usd(required)}` : m.stake === 0n ? "Deploys at the next settlement" : `+${usd(m.pendingStake)} pending`} />
        <Stat label="Backed capital" value={`$${usd(m.allocated)}`} />
        <Stat label="Rebalances left" value={maxRebalances === undefined ? "—" : maxRebalances - used} hint={`${used} used this epoch`} />
      </dl>

      <div className="columns">
        <Panel title="Move your range" className="panel-bright">
          {price !== undefined && <RangeBar low={tickToUsd(m.tickLower)} high={tickToUsd(m.tickUpper)} price={toUsd(price)} />}
          {!deployed ? (
            <p className="note">Your stake deploys at the next settlement. Rebalancing opens after that.</p>
          ) : (
            <>
              <Field label="New range, ± percent around the oracle" unit="%" value={range.width} onChange={range.setWidth} error={range.error} />
              <div className="presets">
                {["0.5", "1", "2", "5", "10"].map((p) => <button type="button" key={p} onClick={() => range.setWidth(p)}>±{p}%</button>)}
              </div>
              {range.ticks && plan && (
                <dl className="rows">
                  <div><dt>New range</dt><dd>${tickToUsd(range.ticks[0]).toFixed(2)} – ${tickToUsd(range.ticks[1]).toFixed(2)}</dd></div>
                  <div><dt>Swap inside the pool</dt><dd>
                    {plan.amountIn === 0n ? "None" : plan.sellWeth ? `Sell ${amount(plan.amountIn, 18)} mWETH` : `Sell ${amount(plan.amountIn, 6, 2)} mUSDC`}
                  </dd></div>
                </dl>
              )}
              <TxButton label="Rebalance" disabled={!plan || paused || limit}
                onClick={() => run("Rebalance", { ...book, functionName: "rebalance", args: [range.ticks![0], range.ticks![1], plan!.sellWeth, plan!.amountIn] })} />
              <p className="muted small">The contract caps the swap price at the oracle price ±5%. Swap fees come out of your capital.</p>
            </>
          )}
        </Panel>
        <div className="stack">
          <Panel title="Top up stake">
            <Field label="Amount" unit="mUSDC" value={top} onChange={setTop} hint={`Wallet: ${usd(balance)}. Joins at the next settlement.`}
              error={topV && balance !== undefined && topV > balance ? "More than your wallet holds." : undefined} />
            <TxButton label="Top up" disabled={!topV || paused || (balance !== undefined && topV > balance)}
              onClick={async () => {
                if (await run("Top up", { ...registry, functionName: "topUpStake", args: [topV!] }, { approve: { spender: registry.address, amount: topV! } })) setTop("");
              }} />
          </Panel>
          <Panel title="Withdraw spare stake">
            <Field label="Amount" unit="mUSDC" value={out} onChange={setOut} max={surplus > 0n ? () => setOut(formatUnits(surplus, 6)) : undefined}
              hint={`${usd(surplus)} is above the requirement. Paid at settlement.${m.stakeWithdrawRequest > 0n ? ` Requested: ${usd(m.stakeWithdrawRequest)}.` : ""}`} />
            <TxButton solid={false} label="Request withdrawal" disabled={!outV}
              onClick={async () => {
                if (await run("Request withdrawal", { ...registry, functionName: "requestStakeWithdraw", args: [outV!] })) setOut("");
              }} />
          </Panel>
          <Link href={`/managers/${m.address}`} className="btn">Your public record <span className="arrow">→</span></Link>
        </div>
      </div>
    </>
  );
}
