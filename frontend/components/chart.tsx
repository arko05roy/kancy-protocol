"use client";

import { motion } from "motion/react";
import { useState } from "react";

export type Point = { label: string; value: number };

/** Dotted-grid line chart with diamond points, matching the brand board. */
export function LineChart({ points, format, caption, zero = false }: {
  points: Point[]; format: (v: number) => string; caption: string; zero?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800, H = 240, P = 16;
  const values = points.map((p) => p.value);
  if (zero) values.push(0);
  let min = Math.min(...values), max = Math.max(...values);
  if (max - min < 1e-9) {
    const pad = Math.abs(max) * 0.01 || 1;
    min -= pad;
    max += pad;
  }
  const x = (i: number) => P + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const shown = points[hover ?? points.length - 1];

  return (
    <figure className="chart">
      <figcaption>
        <span>{caption}</span>
        <b>{format(shown.value)}</b>
        <small>{shown.label}</small>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${caption}: latest ${format(points[points.length - 1].value)}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = (((e.clientX - r.left) / r.width) * W - P) / (W - 2 * P);
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(f * (points.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}>
        <defs>
          <pattern id="dither" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#f4f4f2" opacity=".28" /></pattern>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={P} x2={W - P} y1={P + t * (H - 2 * P)} y2={P + t * (H - 2 * P)} className="chart-grid" />
        ))}
        {zero && min < 0 && max > 0 && <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="chart-zero" />}
        {points.length > 1 && <path d={`${d} L${x(points.length - 1)} ${H - P} L${P} ${H - P} Z`} fill="url(#dither)" />}
        {points.length > 1 && (
          <motion.path d={d} className="chart-line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeInOut" }} />
        )}
        {points.map((p, i) => (
          (points.length <= 40 || i === hover) && (
            <rect key={i} className="chart-point" x={x(i) - 4} y={y(p.value) - 4} width="8" height="8"
              transform={`rotate(45 ${x(i)} ${y(p.value)})`} data-on={hover === i} />
          )
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P} y2={H - P} className="chart-cursor" />}
      </svg>
    </figure>
  );
}

/** A Manager's price range with the current oracle price marked. */
export function RangeBar({ low, high, price }: { low: number; high: number; price: number }) {
  const span = Math.max(high - low, price * 0.002);
  const min = Math.min(low, price) - span * 0.35;
  const max = Math.max(high, price) + span * 0.35;
  const at = (v: number) => ((v - min) / (max - min)) * 100;
  const inside = price >= low && price <= high;
  const f = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return (
    <div className="range">
      <div className="range-track">
        <i className="range-band" style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }} />
        <i className="range-price" style={{ left: `${at(price)}%` }} />
      </div>
      <div className="range-labels">
        <span>{f(low)}</span>
        <strong>{inside ? "In range" : "Out of range"} · oracle {f(price)}</strong>
        <span>{f(high)}</span>
      </div>
    </div>
  );
}
