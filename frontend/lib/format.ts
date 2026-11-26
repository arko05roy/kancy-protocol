import { formatUnits, parseUnits } from "viem";

export const toUsd = (v: bigint | undefined) => (v === undefined ? 0 : Number(v) / 1e6);

export function usd(v: bigint | number | undefined, digits = 2) {
  if (v === undefined) return "—";
  const n = typeof v === "bigint" ? Number(v) / 1e6 : v;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function compact(n: number) {
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

export const signed = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n), digits)}`;

export const pct = (fraction: number, digits = 2) =>
  `${fraction > 0 ? "+" : fraction < 0 ? "−" : ""}${(Math.abs(fraction) * 100).toFixed(digits)}%`;

export const amount = (v: bigint | undefined, decimals: number, digits = 4) =>
  v === undefined ? "—" : Number(formatUnits(v, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });

/** Parse a user-typed amount; returns undefined for anything that is not a positive number. */
export function parseAmount(text: string, decimals = 6): bigint | undefined {
  const t = text.replace(/,/g, "").trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return undefined;
  const v = parseUnits(t, decimals);
  return v > 0n ? v : undefined;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function duration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (x: number) => String(x).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m` : `${pad(m)}:${pad(s % 60)}`;
}

export const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
