"use client";

import { useBalance, useAccount, useReadContracts } from "wagmi";
import { Art, Reveal, Tilt } from "@/components/fx";
import { PixelText } from "@/components/pixel-text";
import { PageHead, Star, TxButton } from "@/components/ui";
import { FAUCET_ETH, usdc, weth } from "@/lib/contracts";
import { amount, duration } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTx } from "@/lib/tx";

const DAY = 86_400;

function Token({ token, symbol, decimals }: { token: typeof usdc; symbol: string; decimals: number }) {
  const { address } = useAccount();
  const { run } = useTx();
  const now = useNow();
  const q = useReadContracts({
    contracts: [
      { ...token, functionName: "faucetAmount" },
      { ...token, functionName: "balanceOf", args: [address!] },
      { ...token, functionName: "lastDrip", args: [address!] },
    ],
    query: { refetchInterval: 20_000 },
  });
  const drip = q.data?.[0]?.result;
  const balance = address ? q.data?.[1]?.result : undefined;
  const last = address ? Number(q.data?.[2]?.result ?? 0n) : 0;
  const wait = last ? last + DAY - now : 0;
  return (
    <Tilt>
      <div className="token">
        <Star size={30} />
        <h2>{symbol}</h2>
        <p className="vault-nav">{amount(drip, decimals, 0)}</p>
        <p className="muted small">per wallet, once a day</p>
        <p>You hold <b>{amount(balance, decimals)}</b></p>
        <TxButton label={`Get ${symbol}`} disabled={wait > 0} onClick={() => run(`Get ${symbol}`, { ...token, functionName: "faucet" })} />
        <p className="muted small" aria-live="polite">{wait > 0 && now > 0 ? `Available again in ${duration(wait)}` : " "}</p>
      </div>
    </Tilt>
  );
}

export function Faucet() {
  const { address } = useAccount();
  const gas = useBalance({ address, query: { enabled: !!address } });
  return (
    <div className="page">
      <PageHead title={<PixelText lines={["Faucet"]} />}
        lead="Free testnet tokens. They have no value. Everything in Kancy is counted in mUSDC."
        art={<Art name="galaxy" className="head-art" />} />
      <div className="cards cards-3">
        <Reveal><Token token={usdc} symbol="mUSDC" decimals={6} /></Reveal>
        <Reveal delay={0.08}><Token token={weth} symbol="mWETH" decimals={18} /></Reveal>
        <Reveal delay={0.16}>
          <Tilt>
            <div className="token">
              <Star size={30} />
              <h2>Gas</h2>
              <p className="vault-nav">ETH</p>
              <p className="muted small">Unichain Sepolia, needed for every transaction</p>
              <p>You hold <b>{gas.data ? amount(gas.data.value, 18, 5) : "—"}</b></p>
              <a className="btn" href={FAUCET_ETH} target="_blank" rel="noreferrer">External faucet ↗</a>
              <p className="muted small">&nbsp;</p>
            </div>
          </Tilt>
        </Reveal>
      </div>
    </div>
  );
}
