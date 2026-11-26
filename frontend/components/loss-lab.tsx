"use client";

import dynamic from "next/dynamic";
import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/format";
import { waterfall } from "@/lib/math";

const OrbitScene = dynamic(() => import("./orbit-scene"), { ssr: false });
const BACKED = 10_000;
const DEPOSIT = 1_000;
const MAX_LOSS = 0.35;

function Slider({ label, value, min, max, step, onChange, show }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span>{label}<b>{show}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${fill}%` } as React.CSSProperties} />
    </label>
  );
}

/** Drag a loss and watch it eat the stake ring before it touches the depositor core. */
export function LossLab() {
  const [stake, setStake] = useState(2000);
  const [loss, setLoss] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.35 });
  const touched = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!seen || touched.current) return;
    const c = animate(0, 0.09, {
      duration: reduce ? 0 : 2.4, delay: reduce ? 0 : 0.5, ease: "easeInOut",
      onUpdate: (v) => !touched.current && setLoss(v),
    });
    return () => c.stop();
  }, [seen, reduce]);

  const set = (v: number) => {
    touched.current = true;
    setLoss(v);
  };
  const w = waterfall(stake, BACKED, loss);
  const yours = (w.fromBackers * DEPOSIT) / BACKED;
  const covered = w.loss > 0 ? w.fromStake / w.loss : 1;
  const breakEven = stake / (stake + BACKED);

  return (
    <div className="lab" ref={ref}>
      <div className="lab-stage">
        <OrbitScene stakeBurn={w.fromStake / stake} coreBurn={w.fromBackers / BACKED}
          label={`Stake ring ${Math.round((w.fromStake / stake) * 100)}% burned, depositor core ${Math.round((w.fromBackers / BACKED) * 100)}% burned`} />
        <div className="lab-legend">
          <span><i className="ring-key" />Outer rings: Manager’s stake, {usd(w.stakeAfter, 0)} left</span>
          <span><i className="core-key" />Core: depositor capital, {usd(w.backersAfter, 0)} left</span>
        </div>
      </div>
      <div className="lab-panel panel">
        <Slider label="Loss this epoch" value={loss} min={0} max={MAX_LOSS} step={0.001} onChange={set} show={`${(loss * 100).toFixed(1)}%`} />
        <Slider label="Manager’s first-loss stake" value={stake} min={1000} max={5000} step={100} onChange={(v) => { touched.current = true; setStake(v); }}
          show={`${usd(stake, 0)} mUSDC`} />
        <div className="presets" role="group" aria-label="Example losses">
          {[["Bad hour", 0.05], ["Crash", 0.15], ["Blow-up", 0.3]].map(([name, v]) => (
            <button type="button" key={name as string} onClick={() => set(v as number)}>{name} −{Math.round((v as number) * 100)}%</button>
          ))}
        </div>
        <div className={`result ${yours > 0 ? "result-hit" : ""}`} aria-live="polite">
          <p>Manager lost <b>{usd(w.loss, 0)}</b></p>
          <p>Stake absorbed <b>{Math.round(covered * 100)}%</b></p>
          <p className="result-you">Your loss on {usd(DEPOSIT, 0)}<strong>{usd(yours, yours > 0 ? 2 : 0)}</strong></p>
        </div>
        <p className="muted small">
          Example vault: {usd(BACKED, 0)} mUSDC allocated to one Manager. With this stake, depositors lose nothing until the loss passes {(breakEven * 100).toFixed(1)}%.
        </p>
      </div>
    </div>
  );
}
